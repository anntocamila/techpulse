export type Category =
  | "ai"
  | "labs"
  | "startups"
  | "business"
  | "events"
  | "tech"
  | "community";

export interface CategoryMeta {
  id: Category;
  label: string;
  emoji: string;
}

/** How a source is fetched.
 *  - "rss": an RSS/Atom feed (default). Tried direct, then via rss2json, then via a CORS proxy.
 *  - Everything else is a public JSON API that sends CORS headers, so the
 *    browser calls it directly with no proxy and no API key. */
export type SourceKind =
  | "rss"
  | "hn-algolia"
  | "hf-models"
  | "hf-papers"
  | "gdelt"
  | "bluesky"
  | "devto"
  | "confs-tech";

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category: Category;
  kind?: SourceKind;
}

export interface Post {
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  sourceId: string;
  sourceCategory: Category;
  tags: Category[];
  imageUrl?: string;
  /** For events: when it happens (ISO date). pubDate stays "when we learned about it". */
  eventDate?: string;
  /** For events: "Buenos Aires, Argentina" or "Online". */
  location?: string;
}
