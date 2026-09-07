import type { FeedSource, Post } from "../types";
import { computeTags } from "./categorize";

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstImageFromHtml(html: string): string | undefined {
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match?.[1];
}

/** Google News titles look like "Headline - Outlet Name". Split them so the
 *  outlet can be shown as "via Outlet" and the headline stays clean. */
function splitGoogleNewsTitle(title: string): { title: string; via?: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx <= 0 || idx > title.length - 4) return { title };
  return { title: title.slice(0, idx).trim(), via: title.slice(idx + 3).trim() };
}

export interface RawItem {
  title?: string;
  link?: string;
  guid?: string;
  description?: string;
  content?: string;
  pubDate?: string;
  thumbnail?: string;
  enclosureUrl?: string;
  via?: string;
  eventDate?: string;
  location?: string;
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toPost(source: FeedSource, raw: RawItem): Post | null {
  let title = raw.title?.trim();
  const link = raw.link?.trim();
  if (!title || !link) return null;

  let via = raw.via;
  if (source.url.startsWith("https://news.google.com/")) {
    const split = splitGoogleNewsTitle(title);
    title = split.title;
    via = via ?? split.via;
  }

  const rawDescription = raw.description || raw.content || "";
  let description = stripHtml(rawDescription).slice(0, 320);
  // Google News descriptions are just the headline again; drop the noise.
  if (description === title || description.startsWith(title)) description = "";

  const imageUrl =
    raw.thumbnail || raw.enclosureUrl || firstImageFromHtml(rawDescription) || undefined;

  return {
    id: raw.guid || link,
    title,
    link,
    description,
    pubDate: toIso(raw.pubDate) ?? new Date().toISOString(),
    source: via ? `${source.name} · via ${via}` : source.name,
    sourceId: source.id,
    sourceCategory: source.category,
    tags: computeTags(title, description, source.category),
    imageUrl,
    eventDate: toIso(raw.eventDate) ?? undefined,
    location: raw.location,
  };
}
