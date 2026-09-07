import type { FeedSource, Post } from "../types";
import { API_FETCHERS } from "./apis";
import { CORS_PROXY, fetchWithTimeout } from "./http";
import { toPost } from "./post";

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

async function fetchViaCorsProxy(source: FeedSource): Promise<Post[]> {
  const url = `${CORS_PROXY}${encodeURIComponent(source.url)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  return parseXmlFeed(source, await res.text());
}

const RSS_STRATEGIES = [fetchDirect, fetchViaRss2Json, fetchViaCorsProxy];

export async function fetchFeed(source: FeedSource): Promise<Post[]> {
  const kind = source.kind ?? "rss";

  if (kind !== "rss") {
    try {
      return await API_FETCHERS[kind](source);
    } catch (err) {
      console.warn(`Failed to load "${source.name}":`, err);
      return [];
    }
  }

  let lastError: unknown;
  for (const strategy of RSS_STRATEGIES) {
    try {
      return await strategy(source);
    } catch (err) {
      lastError = err;
    }
  }
  console.warn(`Failed to load feed "${source.name}":`, lastError);
  return [];
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
  failedSources: string[];
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
  const failedSources: string[] = [];
  const perSource: Post[][] = [];
  let loaded = 0;

  await Promise.all(
    sources.map(async (source) => {
      const posts = await fetchFeed(source);
      if (posts.length === 0) failedSources.push(source.name);
      perSource.push(posts);
      loaded += 1;
      options.onPartial?.(mergePosts(perSource), loaded, sources.length);
    }),
  );

  return { posts: mergePosts(perSource), failedSources };
}
