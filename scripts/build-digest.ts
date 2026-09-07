/**
 * Builds the editorial digest ("edición") that the site renders.
 *
 * Runs in GitHub Actions (see .github/workflows/deploy.yml) or locally with
 * `npm run digest`. Steps:
 *   1. Fetch every source in src/data/feeds.ts server-side (no CORS, no proxies).
 *   2. Keep the last WINDOW_HOURS of posts, dedupe, cap the list.
 *   3. Ask Claude to group them by topic and write a Spanish briefing with
 *      numbered citations. Without ANTHROPIC_API_KEY, fall back to a
 *      headline-only edition grouped by category so the page never goes empty.
 *   4. Write public/digest.json (latest), public/digests/<id>.json (archive)
 *      and public/digests/index.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { CATEGORIES } from "../src/data/categories";
import { FEED_SOURCES } from "../src/data/feeds";
import { API_FETCHERS } from "../src/lib/apis";
import { describeError, fetchWithTimeout, runWithConcurrency } from "../src/lib/http";
import { toPost, type RawItem } from "../src/lib/post";
import { mergePosts } from "../src/lib/rss";
import type { Category, Digest, DigestIndexEntry, DigestSection, FeedSource, Post } from "../src/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, "..", "public");
const ARCHIVE_DIR = path.join(PUBLIC_DIR, "digests");

const WINDOW_HOURS = Number(process.env.DIGEST_WINDOW_HOURS ?? 48);
const MAX_POSTS = Number(process.env.DIGEST_MAX_POSTS ?? 220);
const MAX_PER_SOURCE = 8;
const MAX_ARCHIVE = 60;
const MODEL = process.env.DIGEST_MODEL ?? "claude-opus-5";
const CONCURRENCY = 8;

// --- 1. Fetch -----------------------------------------------------------------

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: false,
});

type XmlValue = string | number | { "#text"?: string; [attr: string]: unknown } | XmlValue[] | undefined;

function text(v: XmlValue): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const t = (v as { "#text"?: unknown })["#text"];
    return t === undefined ? undefined : String(t).trim();
  }
  return String(v).trim();
}

function attr(v: XmlValue, name: string): string | undefined {
  if (Array.isArray(v)) return attr(v[0], name);
  if (v && typeof v === "object") {
    const a = (v as Record<string, unknown>)[`@_${name}`];
    return a === undefined ? undefined : String(a);
  }
  return undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function parseFeedXml(source: FeedSource, body: string): Post[] {
  const doc = xml.parse(body) as Record<string, any>;
  const items: RawItem[] = [];

  const rssItems = asArray(doc?.rss?.channel?.item ?? doc?.["rdf:RDF"]?.item);
  for (const it of rssItems) {
    items.push({
      title: text(it.title),
      link: text(it.link) ?? attr(it.link, "href"),
      guid: text(it.guid),
      description: text(it.description),
      content: text(it["content:encoded"]),
      pubDate: text(it.pubDate) ?? text(it["dc:date"]),
      thumbnail: attr(it["media:thumbnail"], "url") ?? attr(it["media:content"], "url"),
      enclosureUrl: attr(it.enclosure, "url"),
      via: text(it.source),
    });
  }

  for (const en of asArray(doc?.feed?.entry)) {
    const links = asArray(en.link);
    const alt = links.find((l: XmlValue) => attr(l, "rel") === "alternate" || !attr(l, "rel"));
    items.push({
      title: text(en.title),
      link: attr(alt ?? links[0], "href") ?? text(alt),
      guid: text(en.id),
      description: text(en.summary),
      content: text(en.content),
      pubDate: text(en.published) ?? text(en.updated),
    });
  }

  return items.map((raw) => toPost(source, raw)).filter((p): p is Post => p !== null);
}

async function fetchRss(source: FeedSource): Promise<Post[]> {
  const res = await fetchWithTimeout(source.url, 20_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const posts = parseFeedXml(source, await res.text());
  if (posts.length === 0) throw new Error("feed vacío");
  return posts;
}

interface Fetched {
  source: FeedSource;
  posts: Post[];
  error?: string;
}

async function fetchAll(sources: FeedSource[]): Promise<Fetched[]> {
  return runWithConcurrency(
    sources.map((source) => async (): Promise<Fetched> => {
      try {
        const kind = source.kind ?? "rss";
        const posts = kind === "rss" ? await fetchRss(source) : await API_FETCHERS[kind](source);
        return { source, posts };
      } catch (err) {
        return { source, posts: [], error: describeError(err) };
      }
    }),
    CONCURRENCY,
  );
}

// --- 2. Select ----------------------------------------------------------------

function selectPosts(fetched: Fetched[]): Post[] {
  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  const perSource = fetched.map(({ posts }) =>
    posts
      .filter((p) => !p.eventDate && new Date(p.pubDate).getTime() >= cutoff)
      .slice(0, MAX_PER_SOURCE),
  );
  return mergePosts(perSource).slice(0, MAX_POSTS);
}

// --- 3. Write with Claude -----------------------------------------------------

const categoryIds = CATEGORIES.map((c) => c.id) as [Category, ...Category[]];

const SectionSchema = z.object({
  topic: z.string().describe("Nombre corto del tema, ej. 'OpenAI', 'Rondas de inversión', 'Regulación'"),
  emoji: z.string().describe("Un solo emoji que represente el tema"),
  category: z.enum(categoryIds),
  summary: z
    .string()
    .describe("1 a 3 oraciones que expliquen qué pasó y por qué importa. Sin citas acá."),
  items: z
    .array(
      z.object({
        text: z.string().describe("Una noticia concreta en 1 o 2 oraciones."),
        sources: z.array(z.number().int()).min(1).max(4).describe("IDs de las fuentes citadas"),
      }),
    )
    .min(1)
    .max(6),
});

const DigestOutputSchema = z.object({
  title: z
    .string()
    .describe("3 o 4 hitos separados por coma, como el asunto de un newsletter. Ej: 'GPT-6, agentes de OpenAI en una wiki, Fable 5.1'"),
  subtitle: z
    .string()
    .describe("Una bajada de 1 a 3 oraciones que resuma la edición, en tono de newsletter."),
  sections: z.array(SectionSchema).min(4).max(10),
});

const SYSTEM_PROMPT = `Sos el editor de TechPulse, un briefing en español rioplatense sobre inteligencia artificial, startups, negocios tech y tecnología, inspirado en el newsletter "Last Week in AI".

Te doy una lista numerada de titulares recientes con fuente, fecha y un fragmento. Tu trabajo es investigar esa lista y escribir la edición:

- Agrupá las noticias en temas concretos y ordenalos por importancia: primero lo que más mueve la aguja (lanzamientos de modelos, movimientos de los grandes labs, rondas o adquisiciones grandes, regulación), después el resto. Cada tema es una sección.
- Cada sección lleva un resumen de 1 a 3 oraciones que explique qué pasó y por qué importa, y luego ítems concretos. Cada ítem cita entre 1 y 4 IDs de fuente entre corchetes en el campo "sources" (nunca en el texto).
- Afirmá solo lo que está en los titulares y fragmentos. No inventes cifras, nombres ni consecuencias. Si dos fuentes cuentan lo mismo, unificalas en un ítem y citá ambas.
- Priorizá fuentes primarias (blog oficial del lab o la empresa) sobre medios, y medios sobre agregadores.
- Ignorá contenido promocional, tutoriales genéricos, papers sin relevancia clara y modelos sin contexto. Si un tema no tiene sustancia, no lo incluyas.
- Nombrá empresas, modelos y personas con precisión. Mantené un tono informativo, directo, sin hype ni adjetivos vacíos.
- El título de la edición son 3 o 4 hitos separados por coma. La bajada resume la edición en 1 a 3 oraciones.
- Escribí todo en español. Los nombres propios y términos técnicos quedan en su idioma original.`;

function formatPostsForPrompt(posts: Post[]): string {
  return posts
    .map((p, i) => {
      const date = p.pubDate.slice(0, 16).replace("T", " ");
      const snippet = p.description ? ` — ${p.description.slice(0, 220)}` : "";
      return `[${i + 1}] (${p.source}, ${date}) ${p.title}${snippet}`;
    })
    .join("\n");
}

async function writeWithClaude(posts: Post[]): Promise<z.infer<typeof DigestOutputSchema>> {
  const client = new Anthropic();
  const now = new Date();
  const userPrompt = `Fecha de hoy: ${now.toISOString().slice(0, 10)}. Ventana: últimas ${WINDOW_HOURS} horas. ${posts.length} titulares.

${formatPostsForPrompt(posts)}`;

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(DigestOutputSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error(`El modelo rechazó la solicitud (${message.stop_details?.category ?? "sin categoría"})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("La respuesta se cortó por max_tokens");
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("La respuesta no trajo texto");

  const parsed = DigestOutputSchema.safeParse(JSON.parse(textBlock.text));
  if (!parsed.success) throw new Error(`JSON inválido: ${parsed.error.message}`);

  console.log(
    `Claude: ${message.usage.input_tokens} tokens de entrada, ${message.usage.output_tokens} de salida (${message.model})`,
  );
  return parsed.data;
}

// --- 3b. Fallback without a key ----------------------------------------------

function headlinesDigest(posts: Post[]): z.infer<typeof DigestOutputSchema> {
  const sections: DigestSection[] = [];
  for (const cat of CATEGORIES) {
    const picks: { text: string; sources: number[] }[] = [];
    const seenSources = new Set<string>();
    posts.forEach((p, i) => {
      if (picks.length >= 6 || p.sourceCategory !== cat.id) return;
      if (seenSources.has(p.sourceId)) return;
      seenSources.add(p.sourceId);
      picks.push({ text: p.title, sources: [i + 1] });
    });
    if (picks.length === 0) continue;
    sections.push({
      topic: cat.label,
      emoji: cat.emoji,
      category: cat.id,
      summary: `Titulares recientes de ${cat.label.toLowerCase()}. Esta edición no tiene resumen editorial: falta configurar ANTHROPIC_API_KEY en el repositorio.`,
      items: picks,
    });
  }
  const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(new Date());
  return {
    title: `Titulares del ${day}`,
    subtitle: `${posts.length} titulares de las últimas ${WINDOW_HOURS} horas, agrupados por categoría y sin resumen editorial.`,
    sections,
  };
}

// --- 4. Assemble and write ----------------------------------------------------

async function readIndex(): Promise<DigestIndexEntry[]> {
  try {
    return JSON.parse(await readFile(path.join(ARCHIVE_DIR, "index.json"), "utf8"));
  } catch {
    return [];
  }
}

/** Offline development: DIGEST_POSTS_FILE=path.json skips fetching and reads
 *  an array of Post objects instead. */
async function loadFixture(file: string): Promise<Fetched[]> {
  const posts = JSON.parse(await readFile(file, "utf8")) as Post[];
  const bySource = new Map<string, Post[]>();
  for (const p of posts) bySource.set(p.sourceId, [...(bySource.get(p.sourceId) ?? []), p]);
  return FEED_SOURCES.map((source) => {
    const found = bySource.get(source.id) ?? [];
    return found.length > 0 ? { source, posts: found } : { source, posts: [], error: "sin fixture" };
  });
}

async function main() {
  const startedAt = new Date();
  const fixture = process.env.DIGEST_POSTS_FILE;
  console.log(fixture ? `Leyendo fixture ${fixture}…` : `Leyendo ${FEED_SOURCES.length} fuentes…`);
  const fetched = fixture ? await loadFixture(fixture) : await fetchAll(FEED_SOURCES);

  const failed = fetched.filter((f) => f.error);
  for (const f of failed) console.warn(`  ✗ ${f.source.name}: ${f.error}`);
  console.log(`  ${fetched.length - failed.length} fuentes OK, ${failed.length} sin datos`);

  const posts = selectPosts(fetched);
  console.log(`${posts.length} titulares en las últimas ${WINDOW_HOURS} h`);
  if (posts.length === 0) {
    throw new Error("Ninguna fuente devolvió titulares recientes; no se genera edición.");
  }

  let output: z.infer<typeof DigestOutputSchema>;
  let generator: Digest["generator"];
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`Escribiendo la edición con ${MODEL}…`);
    output = await writeWithClaude(posts);
    generator = "claude";
  } else {
    console.log("ANTHROPIC_API_KEY no está definida: edición de titulares sin resumen.");
    output = headlinesDigest(posts);
    generator = "headlines";
  }

  // Keep only the sources that were actually cited, renumbered 1..n.
  const cited = new Set<number>();
  for (const s of output.sections) for (const it of s.items) for (const id of it.sources) cited.add(id);
  const idMap = new Map<number, number>();
  const sources: Digest["sources"] = [];
  for (const oldId of Array.from(cited).sort((a, b) => a - b)) {
    const p = posts[oldId - 1];
    if (!p) continue;
    idMap.set(oldId, sources.length + 1);
    sources.push({ id: sources.length + 1, title: p.title, url: p.link, source: p.source, date: p.pubDate });
  }
  const sections = output.sections.map((s) => ({
    ...s,
    items: s.items
      .map((it) => ({ text: it.text, sources: it.sources.map((id) => idMap.get(id)).filter((n): n is number => !!n) }))
      .filter((it) => it.sources.length > 0),
  }));

  const id = startedAt.toISOString().slice(0, 13).replace("T", "-"); // 2026-09-07-15
  const digest: Digest = {
    id,
    generatedAt: startedAt.toISOString(),
    periodStart: new Date(startedAt.getTime() - WINDOW_HOURS * 3600 * 1000).toISOString(),
    periodEnd: startedAt.toISOString(),
    title: output.title,
    subtitle: output.subtitle,
    sections,
    sources,
    stats: { posts: posts.length, sourcesOk: fetched.length - failed.length, sourcesFailed: failed.length },
    generator,
    model: generator === "claude" ? MODEL : undefined,
  };

  await mkdir(ARCHIVE_DIR, { recursive: true });
  await writeFile(path.join(PUBLIC_DIR, "digest.json"), JSON.stringify(digest, null, 2));
  await writeFile(path.join(ARCHIVE_DIR, `${id}.json`), JSON.stringify(digest, null, 2));

  const index = (await readIndex()).filter((e) => e.id !== id);
  index.unshift({ id, generatedAt: digest.generatedAt, title: digest.title, generator });
  await writeFile(path.join(ARCHIVE_DIR, "index.json"), JSON.stringify(index.slice(0, MAX_ARCHIVE), null, 2));

  console.log(`Edición ${id} escrita: "${digest.title}" (${sections.length} secciones, ${sources.length} fuentes citadas)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
