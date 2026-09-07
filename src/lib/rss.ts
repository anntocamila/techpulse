import type { FailedSource, FeedSource, Post } from "../types";
import { API_FETCHERS } from "./apis";
import { describeError, fetchTextViaProxies, fetchWithTimeout, runWithConcurrency } from "./http";
import { toPost } from "./post";

/** How many sources are fetched at once. Free proxies throttle bursts. */
const CONCURRENCY = 6;

const RSS2JSON_ENDPOINT = "https://api.rss2json.com/v1/api.json?rss_url=";

function textOf(el: Element | null | undefined): string | undefined {
  return el?.textContent?.trim() || undefined;
}

export function parseXmlFeed(source: FeedSource, xmlText: string): Post[] {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`XML parse error for ${source.id}`);
  }

  const rssItems = Array.from(doc.querySelectorAll("item"));
  if (rssItems.length > 0) {
    return rssItems
      .map((item) => {
        const enclosure = item.querySelector("enclosure");
        const mediaThumb =
          item.getElementsByTagName("media:thumbnail")[0] ??
          item.getElementsByTagName("media:content")[0];
        return toPost(source, {
          title: textOf(item.querySelector("title")),
          link:
            textOf(item.querySelector("link")) ||
            item.querySelector("link")?.getAttribute("href") ||
            undefined,
          guid: textOf(item.querySelector("guid")),
          description: textOf(item.querySelector("description")),
          content: textOf(item.getElementsByTagName("content:encoded")[0]),
          pubDate:
            textOf(item.querySelector("pubDate")) ||
            textOf(item.getElementsByTagName("dc:date")[0]),
          thumbnail: mediaThumb?.getAttribute("url") || undefined,
          enclosureUrl: enclosure?.getAttribute("url") || undefined,
          via: textOf(item.querySelector("source")),
        });
      })
      .filter((p): p is Post => p !== null);
  }

  return Array.from(doc.querySelectorAll("entry"))
    .map((entry) => {
      const linkEl =
        entry.querySelector('link[rel="alternate"]') ||
        entry.querySelector("link[href]") ||
        entry.querySelector("link");
      return toPost(source, {
        title: textOf(entry.querySelector("title")),
        link: linkEl?.getAttribute("href") || textOf(linkEl),
        guid: textOf(entry.querySelector("id")),
        description: textOf(entry.querySelector("summary")),
        content: textOf(entry.querySelector("content")),
        pubDate:
          textOf(entry.querySelector("published")) || textOf(entry.querySelector("updated")),
      });
    })
    .filter((p): p is Post => p !== null);
}

/** Some feeds (arXiv, GitHub, a few blogs) send CORS headers; try them
 *  directly first so they don't consume the proxies' quota. */
async function fetchDirect(source: FeedSource): Promise<Post[]> {
  const res = await fetchWithTimeout(source.url, 8_000);
  if (!res.ok) throw new Error(`direct HTTP ${res.status}`);
  const posts = parseXmlFeed(source, await res.text());
  if (posts.length === 0) throw new Error("direct: empty feed");
  return posts;
}

async function fetchViaRss2Json(source: FeedSource): Promise<Post[]> {
  const url = `${RSS2JSON_ENDPOINT}${encodeURIComponent(source.url)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`rss2json HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) {
    throw new Error(`rss2json bad response for ${source.id}`);
  }

  return (data.items as Array<Record<string, unknown>>)
    .map((item) =>
      toPost(source, {
        title: item.title as string,
        link: item.link as string,
        guid: item.guid as string,
        description: item.description as string,
        content: item.content as string,
        pubDate: item.pubDate as string,
        thumbnail: item.thumbnail as string,
        enclosureUrl: (item.enclosure as { link?: string } | undefined)?.link,
      }),
    )
    .filter((p): p is Post => p !== null);
}

async function fetchViaCorsProxies(source: FeedSource): Promise<Post[]> {
  return parseXmlFeed(source, await fetchTextViaProxies(source.url));
}

const RSS_STRATEGIES: [string, (s: FeedSource) => Promise<Post[]>][] = [
  ["direct", fetchDirect],
  ["rss2json", fetchViaRss2Json],
  ["proxies", fetchViaCorsProxies],
];

export interface FeedResult {
  posts: Post[];
  /** Set when the source yielded nothing: every attempt's reason, joined. */
  error?: string;
}

export async function fetchFeed(source: FeedSource): Promise<FeedResult> {
  const kind = source.kind ?? "rss";

  if (kind !== "rss") {
    try {
      const posts = await API_FETCHERS[kind](source);
      return posts.length > 0 ? { posts } : { posts, error: "respuesta vacía" };
    } catch (err) {
      return { posts: [], error: describeError(err) };
    }
  }

  const reasons: string[] = [];
  for (const [name, strategy] of RSS_STRATEGIES) {
    try {
      const posts = await strategy(source);
      if (posts.length > 0) return { posts };
      reasons.push(`${name}: feed vacío`);
    } catch (err) {
      reasons.push(`${name}: ${describeError(err)}`);
    }
  }
  return { posts: [], error: reasons.join(" · ") };
}

export function mergePosts(lists: Post[][]): Post[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((post) => {
      const key = post.link.replace(/[?#].*$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

export interface FetchAllResult {
  posts: Post[];
  failedSources: FailedSource[];
}

export interface FetchAllOptions {
  /** Called every time a source finishes, with everything loaded so far.
   *  Lets the UI render progressively instead of waiting for the slowest feed. */
  onPartial?: (posts: Post[], loaded: number, total: number) => void;
}

export async function fetchAllFeeds(
  sources: FeedSource[],
  options: FetchAllOptions = {},
): Promise<FetchAllResult> {
  const failedSources: FailedSource[] = [];
  const perSource: Post[][] = [];
  let loaded = 0;

  // Direct-API sources first: they answer in well under a second and don't
  // touch the proxies, so the feed paints almost immediately.
  const ordered = [...sources].sort((a, b) => {
    const aApi = a.kind && a.kind !== "rss" ? 0 : 1;
    const bApi = b.kind && b.kind !== "rss" ? 0 : 1;
    return aApi - bApi;
  });

  await runWithConcurrency(
    ordered.map((source) => async () => {
      const { posts, error } = await fetchFeed(source);
      if (error) {
        failedSources.push({ name: source.name, reason: error });
        console.warn(`"${source.name}": ${error}`);
      }
      perSource.push(posts);
      loaded += 1;
      options.onPartial?.(mergePosts(perSource), loaded, sources.length);
    }),
    CONCURRENCY,
  );

  return { posts: mergePosts(perSource), failedSources };
}
