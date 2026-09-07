/**
 * Public JSON APIs that send CORS headers, so the browser can call them
 * directly: no proxy, no API key, and they refresh in minutes rather than
 * whenever a publisher pushes an RSS item.
 */
import type { FeedSource, Post } from "../types";
import { fetchJson } from "./http";
import { stripHtml, toPost } from "./post";

const keep = (posts: (Post | null)[]) => posts.filter((p): p is Post => p !== null);

// --- Hacker News (Algolia) ---------------------------------------------------

interface HnHit {
  objectID: string;
  title?: string;
  url?: string;
  story_text?: string;
  created_at: string;
  points?: number;
  num_comments?: number;
}

export async function fetchHackerNews(source: FeedSource): Promise<Post[]> {
  const data = await fetchJson<{ hits: HnHit[] }>(source.url);
  return keep(
    data.hits.map((hit) =>
      toPost(source, {
        title: hit.title,
        link: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        guid: `hn-${hit.objectID}`,
        description: `${hit.points ?? 0} puntos · ${hit.num_comments ?? 0} comentarios${
          hit.story_text ? ` · ${stripHtml(hit.story_text)}` : ""
        }`,
        pubDate: hit.created_at,
      }),
    ),
  );
}

// --- Hugging Face: trending models -----------------------------------------

interface HfModel {
  id: string;
  lastModified?: string;
  pipeline_tag?: string;
  likes?: number;
  downloads?: number;
  author?: string;
}

export async function fetchHfModels(source: FeedSource): Promise<Post[]> {
  const models = await fetchJson<HfModel[]>(source.url);
  return keep(
    models.map((m) =>
      toPost(source, {
        title: m.id,
        link: `https://huggingface.co/${m.id}`,
        guid: `hf-model-${m.id}`,
        description: [
          m.pipeline_tag,
          m.likes !== undefined ? `❤️ ${m.likes.toLocaleString("es-AR")}` : null,
          m.downloads !== undefined ? `⬇️ ${m.downloads.toLocaleString("es-AR")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        pubDate: m.lastModified,
      }),
    ),
  );
}

// --- Hugging Face: daily papers --------------------------------------------

interface HfDailyPaper {
  paper: { id: string; title: string; summary?: string; publishedAt?: string; upvotes?: number };
  publishedAt?: string;
  thumbnail?: string;
}

export async function fetchHfPapers(source: FeedSource): Promise<Post[]> {
  const papers = await fetchJson<HfDailyPaper[]>(source.url);
  return keep(
    papers.map((p) =>
      toPost(source, {
        title: p.paper.title,
        link: `https://huggingface.co/papers/${p.paper.id}`,
        guid: `hf-paper-${p.paper.id}`,
        description: `${p.paper.upvotes ?? 0} votos · ${p.paper.summary ?? ""}`,
        pubDate: p.publishedAt ?? p.paper.publishedAt,
        thumbnail: p.thumbnail,
      }),
    ),
  );
}

// --- GDELT: global news, refreshed every 15 minutes -------------------------

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string; // 20260907T120000Z
  domain?: string;
  socialimage?: string;
  language?: string;
}

function gdeltDate(seendate: string): string {
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : seendate;
}

/** GDELT answers 429 to concurrent calls from one IP: space them out. */
const GDELT_GAP_MS = 6_000;
let gdeltQueue: Promise<unknown> = Promise.resolve();

function gdeltSlot<T>(job: () => Promise<T>): Promise<T> {
  const run = gdeltQueue.then(job);
  gdeltQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, GDELT_GAP_MS)));
  return run;
}

export async function fetchGdelt(source: FeedSource): Promise<Post[]> {
  const data = await gdeltSlot(() => fetchJson<{ articles?: GdeltArticle[] }>(source.url));
  return keep(
    (data.articles ?? []).map((a) =>
      toPost(source, {
        title: a.title,
        link: a.url,
        guid: a.url,
        pubDate: gdeltDate(a.seendate),
        thumbnail: a.socialimage || undefined,
        via: a.domain,
      }),
    ),
  );
}

// --- Bluesky: public AppView, no auth needed for public posts ---------------

interface BskyPost {
  uri: string;
  author: { handle: string; displayName?: string };
  record: { text?: string; createdAt?: string };
  likeCount?: number;
  repostCount?: number;
  embed?: { images?: { thumb?: string }[]; external?: { thumb?: string; title?: string } };
}

export async function fetchBluesky(source: FeedSource): Promise<Post[]> {
  const data = await fetchJson<{ posts?: BskyPost[]; feed?: { post: BskyPost }[] }>(source.url);
  const posts = data.posts ?? data.feed?.map((f) => f.post) ?? [];
  return keep(
    posts.map((p) => {
      const rkey = p.uri.split("/").pop();
      const text = (p.record.text ?? "").trim();
      if (!text) return null;
      const firstLine = text.split("\n")[0];
      return toPost(source, {
        title: firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine,
        link: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
        guid: p.uri,
        description: text.length > firstLine.length ? text : `${p.likeCount ?? 0} likes · ${p.repostCount ?? 0} reposts`,
        pubDate: p.record.createdAt,
        thumbnail: p.embed?.images?.[0]?.thumb || p.embed?.external?.thumb,
        via: p.author.displayName || p.author.handle,
      });
    }),
  );
}

// --- dev.to -----------------------------------------------------------------

interface DevtoArticle {
  id: number;
  title: string;
  url: string;
  description?: string;
  published_at: string;
  positive_reactions_count?: number;
  cover_image?: string | null;
  user?: { name?: string };
}

export async function fetchDevto(source: FeedSource): Promise<Post[]> {
  const articles = await fetchJson<DevtoArticle[]>(source.url);
  return keep(
    articles.map((a) =>
      toPost(source, {
        title: a.title,
        link: a.url,
        guid: `devto-${a.id}`,
        description: `${a.positive_reactions_count ?? 0} reacciones · ${a.description ?? ""}`,
        pubDate: a.published_at,
        thumbnail: a.cover_image || undefined,
        via: a.user?.name,
      }),
    ),
  );
}

// --- confs.tech: open data of tech conferences ------------------------------

interface ConfsTechEvent {
  name: string;
  url: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  city?: string;
  country?: string;
  online?: boolean;
  cfpUrl?: string;
  cfpEndDate?: string;
}

const UPCOMING_WINDOW_DAYS = 120;

export async function fetchConfsTech(source: FeedSource): Promise<Post[]> {
  const events = await fetchJson<ConfsTechEvent[]>(source.url);
  const now = Date.now();
  const horizon = now + UPCOMING_WINDOW_DAYS * 24 * 3600 * 1000;

  return keep(
    events
      .filter((e) => {
        const t = new Date(e.startDate).getTime();
        return !Number.isNaN(t) && t >= now - 24 * 3600 * 1000 && t <= horizon;
      })
      .map((e) => {
        const place = e.online
          ? "Online"
          : [e.city, e.country].filter(Boolean).join(", ") || undefined;
        // Location is rendered on its own line from `location`, so the
        // description only carries what's extra: an open call for papers.
        const cfp =
          e.cfpEndDate && new Date(e.cfpEndDate).getTime() > now
            ? `CFP abierto hasta ${e.cfpEndDate}`
            : "";
        return toPost(source, {
          title: e.name,
          link: e.url,
          guid: `confs-${e.name}-${e.startDate}`,
          description: cfp,
          // "When we learned about it" is now; the actual date lives in eventDate.
          pubDate: new Date().toISOString(),
          eventDate: e.startDate,
          location: place,
        });
      }),
  );
}

export const API_FETCHERS = {
  "hn-algolia": fetchHackerNews,
  "hf-models": fetchHfModels,
  "hf-papers": fetchHfPapers,
  gdelt: fetchGdelt,
  bluesky: fetchBluesky,
  devto: fetchDevto,
  "confs-tech": fetchConfsTech,
} as const;
