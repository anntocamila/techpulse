import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FEED_SOURCES } from "./data/feeds";
import { fetchAllFeeds } from "./lib/rss";
import { liveSearch, rankResults } from "./lib/search";
import { loadCachedPosts, saveCachedPosts } from "./lib/cache";
import { loadDisabledSources, saveDisabledSources } from "./lib/prefs";
import { loadDigestById, loadDigestIndex, loadLatestDigest } from "./lib/digest";
import type { Category, Digest, DigestIndexEntry, FailedSource, Post } from "./types";
import Sidebar from "./components/Sidebar";
import MobileTabs from "./components/MobileTabs";
import Header, { headerLabel } from "./components/Header";
import AskBar from "./components/AskBar";
import Feed from "./components/Feed";
import RightPanel from "./components/RightPanel";
import DigestView from "./components/DigestView";

// ~75 sources per refresh; most go through free proxies with daily quotas,
// so 10 minutes keeps a whole day of use comfortably inside them.
const AUTO_REFRESH_MS = 10 * 60 * 1000;
const PAGE_SIZE = 20;

type View = "digest" | "feed";

interface LiveState {
  question: string;
  query: string | null;
  posts: Post[];
  isSearching: boolean;
  error: string | null;
}

/** Events tab: upcoming events first (soonest on top), then everything else newest-first. */
function sortForEvents(posts: Post[]): Post[] {
  const now = Date.now();
  const upcoming = posts
    .filter((p) => p.eventDate && new Date(p.eventDate).getTime() >= now - 86_400_000)
    .sort((a, b) => new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime());
  const rest = posts.filter((p) => !upcoming.includes(p));
  return [...upcoming, ...rest];
}

function TopNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const tab = (id: View, label: string) => (
    <button
      onClick={() => onChange(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        view === id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
        <button onClick={() => onChange("digest")} className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            📡
          </span>
          <span className="serif text-lg font-bold text-zinc-900">TechPulse</span>
        </button>
        <nav className="flex gap-1">
          {tab("digest", "Edición")}
          {tab("feed", "Feed en vivo")}
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("digest");

  // --- Digest ---
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);
  const [archive, setArchive] = useState<DigestIndexEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [latest, index] = await Promise.all([loadLatestDigest(), loadDigestIndex()]);
      if (cancelled) return;
      setDigest(latest);
      setArchive(index);
      setDigestLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectEdition = async (id: string) => {
    setDigestLoading(true);
    const d = await loadDigestById(id);
    if (d) setDigest(d);
    setDigestLoading(false);
  };

  // --- Feed ---
  const cached = useRef(loadCachedPosts()).current;
  const [posts, setPosts] = useState<Post[]>(cached?.posts ?? []);
  const [failedSources, setFailedSources] = useState<FailedSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.savedAt ?? null);
  const [disabledSources, setDisabledSources] = useState<Set<string>>(() => loadDisabledSources());

  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [live, setLive] = useState<LiveState | null>(null);

  // Read through a ref so toggling a source doesn't recreate `load` and
  // re-fetch everything; the new set is simply used on the next refresh.
  const disabledRef = useRef(disabledSources);
  disabledRef.current = disabledSources;

  const load = useCallback(async () => {
    const activeSources = FEED_SOURCES.filter((s) => !disabledRef.current.has(s.id));
    setIsLoading(true);
    setError(null);
    setProgress({ loaded: 0, total: activeSources.length });
    try {
      const { posts: fetched, failedSources: failed } = await fetchAllFeeds(activeSources, {
        onPartial: (partial, loaded, total) => {
          setProgress({ loaded, total });
          if (partial.length > 0) setPosts(partial);
        },
      });
      setFailedSources(failed);
      setLastUpdated(new Date());
      if (fetched.length === 0) {
        setError("Ninguna fuente respondió. Probá actualizar en unos minutos.");
      } else {
        setPosts(fetched);
        saveCachedPosts(fetched);
      }
    } catch {
      setError("Ocurrió un error inesperado al traer las noticias.");
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, []);

  // The live feed only starts fetching once the user opens it: the digest is
  // the default view and shouldn't pay for 70+ requests it doesn't need.
  const feedStarted = useRef(false);
  useEffect(() => {
    if (view !== "feed" || feedStarted.current) return;
    feedStarted.current = true;
    load();
  }, [view, load]);

  useEffect(() => {
    if (!feedStarted.current) return;
    const interval = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load, view]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory, query, live?.question]);

  const toggleSource = (id: string) => {
    setDisabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDisabledSources(next);
      return next;
    });
  };

  const ask = useCallback(async (question: string) => {
    setLive({ question, query: null, posts: [], isSearching: true, error: null });
    try {
      const result = await liveSearch(question, {
        onPartial: (partial) =>
          setLive((prev) =>
            prev && prev.question === question ? { ...prev, posts: partial } : prev,
          ),
      });
      setLive((prev) =>
        prev && prev.question === question
          ? {
              ...prev,
              query: result.query,
              posts: rankResults(result.posts, result.query),
              isSearching: false,
              error:
                result.posts.length === 0
                  ? "No encontré noticias para esa pregunta. Probá con otras palabras."
                  : null,
            }
          : prev,
      );
    } catch {
      setLive((prev) =>
        prev && prev.question === question
          ? { ...prev, isSearching: false, error: "La búsqueda en vivo falló." }
          : prev,
      );
    }
  }, []);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = live ? live.posts : posts;
    const filtered = base.filter((post) => {
      if (!live && disabledSources.has(post.sourceId)) return false;
      const matchesCategory =
        live !== null || activeCategory === "all" || post.tags.includes(activeCategory);
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        post.description.toLowerCase().includes(q) ||
        post.source.toLowerCase().includes(q)
      );
    });
    return !live && activeCategory === "events" ? sortForEvents(filtered) : filtered;
  }, [posts, live, activeCategory, query, disabledSources]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: posts.length };
    for (const post of posts) {
      for (const tag of post.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [posts]);

  const selectCategory = (c: Category | "all") => {
    setLive(null);
    setActiveCategory(c);
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <TopNav view={view} onChange={setView} />

      {view === "digest" ? (
        <DigestView
          digest={digest}
          isLoading={digestLoading}
          archive={archive}
          onSelectEdition={selectEdition}
          onOpenFeed={() => setView("feed")}
        />
      ) : (
        <div className="mx-auto flex max-w-6xl">
          <div className="hidden w-64 shrink-0 border-r border-zinc-200 lg:block">
            <div className="sticky top-12">
              <Sidebar active={live ? null : activeCategory} onSelect={selectCategory} counts={categoryCounts} />
            </div>
          </div>

          <main className="min-h-screen w-full max-w-2xl flex-1 border-r border-zinc-200">
            <MobileTabs active={live ? null : activeCategory} onSelect={selectCategory} />
            <Header
              activeLabel={live ? "Búsqueda en vivo" : headerLabel(activeCategory)}
              query={query}
              onQueryChange={setQuery}
              onRefresh={live ? () => ask(live.question) : load}
              isLoading={live ? live.isSearching : isLoading}
              lastUpdated={live ? null : lastUpdated}
              progress={progress}
            />
            <AskBar
              onAsk={ask}
              isSearching={live?.isSearching ?? false}
              activeQuestion={live?.question ?? null}
              resolvedQuery={live?.query ?? null}
              onClear={() => setLive(null)}
            />
            <Feed
              posts={filteredPosts}
              isLoading={live ? live.isSearching : isLoading}
              error={live ? live.error : error}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
            />
          </main>

          <RightPanel
            failedSources={failedSources}
            disabledSources={disabledSources}
            onToggleSource={toggleSource}
          />
        </div>
      )}
    </div>
  );
}
