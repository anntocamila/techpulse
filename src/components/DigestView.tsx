import type { Digest, DigestIndexEntry, DigestItem } from "../types";
import { CATEGORY_LABEL } from "../data/categories";
import { timeAgo } from "../lib/time";

interface Props {
  digest: Digest | null;
  isLoading: boolean;
  archive: DigestIndexEntry[];
  onSelectEdition: (id: string) => void;
  onOpenFeed: () => void;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function Citations({ item, digest }: { item: DigestItem; digest: Digest }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
      {item.sources.map((id) => {
        const src = digest.sources.find((s) => s.id === id);
        if (!src) return null;
        return (
          <a
            key={id}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${src.source} · ${src.title}`}
            className="rounded bg-sky-50 px-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            {id}
          </a>
        );
      })}
    </span>
  );
}

export default function DigestView({ digest, isLoading, archive, onSelectEdition, onOpenFeed }: Props) {
  if (isLoading && !digest) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse px-6 py-16">
        <div className="mb-4 h-3 w-40 rounded bg-zinc-200" />
        <div className="mb-3 h-10 w-full rounded bg-zinc-200" />
        <div className="mb-8 h-10 w-3/4 rounded bg-zinc-200" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-6 space-y-2">
            <div className="h-6 w-1/3 rounded bg-zinc-200" />
            <div className="h-4 w-full rounded bg-zinc-100" />
            <div className="h-4 w-5/6 rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    );
  }

  if (!digest) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="serif text-3xl font-bold text-zinc-900">Todavía no hay ninguna edición</p>
        <p className="mt-4 text-zinc-600">
          La primera edición se genera cuando corre el workflow de GitHub Actions. Mientras tanto
          podés ver las noticias en el feed en vivo.
        </p>
        <button
          onClick={onOpenFeed}
          className="mt-6 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Ver el feed en vivo
        </button>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-6 pb-24 pt-10">
      <header className="border-b border-zinc-200 pb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            TechPulse · Edición del {formatDate(digest.generatedAt)}
          </p>
          {archive.length > 1 && (
            <select
              value={digest.id}
              onChange={(e) => onSelectEdition(e.target.value)}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700"
              aria-label="Elegir edición"
            >
              {archive.map((e) => (
                <option key={e.id} value={e.id}>
                  {new Date(e.generatedAt).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {e.title.slice(0, 48)}
                </option>
              ))}
            </select>
          )}
        </div>

        <h1 className="serif text-4xl font-bold leading-tight text-zinc-900 md:text-5xl">{digest.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-zinc-600">{digest.subtitle}</p>

        <p className="mt-6 text-sm text-zinc-500">
          Generado {timeAgo(digest.generatedAt)} a partir de {digest.stats.posts} titulares de{" "}
          {digest.stats.sourcesOk} fuentes
          {digest.model ? ` · escrito con ${digest.model}` : ""}
          {" · "}
          <button onClick={onOpenFeed} className="text-sky-700 underline-offset-2 hover:underline">
            ver el feed en vivo
          </button>
        </p>

        {digest.generator === "headlines" && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Edición sin resumen editorial.</strong> Faltó la variable{" "}
            <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> en los secrets del
            repositorio, así que esta edición solo agrupa titulares por categoría. Al agregarla, la
            próxima corrida escribe el briefing completo.
          </div>
        )}
      </header>

      {digest.sections.map((section, i) => (
        <section key={`${section.topic}-${i}`} className="border-b border-zinc-200 py-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="serif text-2xl font-bold text-zinc-900">
              <span className="mr-2" aria-hidden>
                {section.emoji}
              </span>
              {section.topic}
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              {CATEGORY_LABEL[section.category] ?? section.category}
            </span>
          </div>

          <p className="mb-4 leading-relaxed text-zinc-700">{section.summary}</p>

          <ul className="space-y-3">
            {section.items.map((item, j) => (
              <li key={j} className="flex gap-3 leading-relaxed text-zinc-800">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                <span>
                  {item.text}
                  <Citations item={item} digest={digest} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="pt-8">
        <h2 className="serif mb-4 text-xl font-bold text-zinc-900">Fuentes</h2>
        <ol className="space-y-2 text-sm">
          {digest.sources.map((s) => (
            <li key={s.id} className="flex gap-3">
              <span className="w-6 shrink-0 text-right text-zinc-400">{s.id}</span>
              <span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-zinc-800 hover:text-sky-700 hover:underline"
                >
                  {s.title}
                </a>
                <span className="text-zinc-500">
                  {" "}
                  · {s.source} · {timeAgo(s.date)}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-xs text-zinc-400">
          Período cubierto: {new Date(digest.periodStart).toLocaleString("es-AR")} a{" "}
          {new Date(digest.periodEnd).toLocaleString("es-AR")}.
        </p>
      </footer>
    </article>
  );
}
