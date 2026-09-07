import type { FeedSource } from "../types";

/** Google News exposes a public RSS endpoint for any search query. It is the
 *  most reliable way to follow companies that don't publish their own feed
 *  (Anthropic, Mistral, xAI...) and it aggregates hundreds of outlets. */
export function googleNewsSearchUrl(query: string, lang: "en" | "es" = "en"): string {
  const locale = lang === "es" ? "hl=es-419&gl=AR&ceid=AR:es-419" : "hl=en-US&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`;
}

/** GDELT DOC API: global news across 100+ languages, refreshed every 15 min. */
function gdeltUrl(query: string): string {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    maxrecords: "30",
    format: "json",
    sort: "datedesc",
    timespan: "24h",
  });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

/** confs.tech keeps open JSON data of tech conferences per year and topic. */
function confsTechUrl(topic: string, year = new Date().getFullYear()): string {
  return `https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/${year}/${topic}.json`;
}

const YEAR = new Date().getFullYear();

// Curated public sources. Every one is free and requires no API key.
export const FEED_SOURCES: FeedSource[] = [
  // --- Labs de IA (las empresas que hacen los modelos) ---
  { id: "openai", name: "OpenAI", url: "https://openai.com/news/rss.xml", category: "labs" },
  {
    id: "anthropic",
    name: "Anthropic",
    url: googleNewsSearchUrl('"Anthropic" AND (Claude OR model OR AI)'),
    category: "labs",
  },
  {
    id: "deepmind",
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    category: "labs",
  },
  { id: "googleai", name: "Google AI", url: "https://blog.google/technology/ai/rss/", category: "labs" },
  {
    id: "google-research",
    name: "Google Research",
    url: "https://research.google/blog/rss/",
    category: "labs",
  },
  { id: "meta-ai", name: "Meta AI", url: "https://ai.meta.com/blog/rss/", category: "labs" },
  { id: "mistral", name: "Mistral AI", url: googleNewsSearchUrl('"Mistral AI"'), category: "labs" },
  { id: "xai", name: "xAI", url: googleNewsSearchUrl('"xAI" AND Grok'), category: "labs" },
  {
    id: "perplexity",
    name: "Perplexity",
    url: googleNewsSearchUrl('"Perplexity AI"'),
    category: "labs",
  },
  { id: "cohere", name: "Cohere", url: googleNewsSearchUrl('"Cohere" AND AI'), category: "labs" },
  {
    id: "huggingface",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    category: "labs",
  },
  { id: "nvidia", name: "NVIDIA", url: "https://blogs.nvidia.com/feed/", category: "labs" },
  {
    id: "nvidia-dev",
    name: "NVIDIA Developer",
    url: "https://developer.nvidia.com/blog/feed",
    category: "labs",
  },
  {
    id: "microsoft-ai",
    name: "Microsoft AI",
    url: "https://blogs.microsoft.com/ai/feed/",
    category: "labs",
  },
  {
    id: "microsoft-research",
    name: "Microsoft Research",
    url: "https://www.microsoft.com/en-us/research/feed/",
    category: "labs",
  },
  {
    id: "apple-ml",
    name: "Apple ML Research",
    url: "https://machinelearning.apple.com/rss.xml",
    category: "labs",
  },
  {
    id: "amazon-science",
    name: "Amazon Science",
    url: "https://www.amazon.science/index.rss",
    category: "labs",
  },

  // --- Inteligencia artificial: APIs en vivo + medios + research ---
  {
    id: "hf-models",
    name: "Hugging Face · Modelos",
    url: "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=20",
    category: "ai",
    kind: "hf-models",
  },
  {
    id: "hf-papers",
    name: "Hugging Face · Papers",
    url: "https://huggingface.co/api/daily_papers?limit=25",
    category: "ai",
    kind: "hf-papers",
  },
  { id: "arxiv-ai", name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", category: "ai" },
  { id: "arxiv-cl", name: "arXiv cs.CL", url: "https://rss.arxiv.org/rss/cs.CL", category: "ai" },
  {
    id: "artificialintelligence-news",
    name: "AI News",
    url: "https://www.artificialintelligence-news.com/feed/",
    category: "ai",
  },
  {
    id: "venturebeat-ai",
    name: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed/",
    category: "ai",
  },
  { id: "marktechpost", name: "MarkTechPost", url: "https://www.marktechpost.com/feed/", category: "ai" },
  {
    id: "technologyreview",
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    category: "ai",
  },
  {
    id: "theverge-ai",
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    category: "ai",
  },
  {
    id: "google-news-ai",
    name: "Google News · IA",
    url: googleNewsSearchUrl("artificial intelligence"),
    category: "ai",
  },
  {
    id: "gdelt-ai",
    name: "GDELT · IA global",
    // GDELT requires OR-lists to be wrapped in parentheses.
    url: gdeltUrl('("artificial intelligence" OR "AI model" OR "large language model")'),
    category: "ai",
    kind: "gdelt",
  },

  // --- Comunidad: newsletters, blogs y redes ---
  {
    id: "import-ai",
    name: "Import AI",
    url: "https://importai.substack.com/feed",
    category: "community",
  },
  {
    id: "the-batch",
    name: "The Batch",
    url: "https://www.deeplearning.ai/the-batch/feed/",
    category: "community",
  },
  {
    id: "interconnects",
    name: "Interconnects",
    url: "https://www.interconnects.ai/feed",
    category: "community",
  },
  {
    id: "simonwillison",
    name: "Simon Willison",
    url: "https://simonwillison.net/atom/everything/",
    category: "community",
  },
  { id: "latent-space", name: "Latent Space", url: "https://www.latent.space/feed", category: "community" },
  {
    id: "one-useful-thing",
    name: "One Useful Thing",
    url: "https://www.oneusefulthing.org/feed",
    category: "community",
  },
  {
    id: "bens-bites",
    name: "Ben's Bites",
    url: "https://bensbites.beehiiv.com/feed",
    category: "community",
  },
  { id: "last-week-in-ai", name: "Last Week in AI", url: "https://lastweekin.ai/feed", category: "community" },
  { id: "platformer", name: "Platformer", url: "https://www.platformer.news/feed", category: "community" },
  {
    id: "bluesky-ai",
    name: "Bluesky · IA",
    // Bluesky search has no OR operator; a single strong term works best.
    url: "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=LLM&sort=latest&limit=25",
    category: "community",
    kind: "bluesky",
  },
  {
    id: "devto-ai",
    name: "dev.to · IA",
    url: "https://dev.to/api/articles?tag=ai&top=1&per_page=20",
    category: "community",
    kind: "devto",
  },
  {
    id: "hackernews-ai",
    name: "Hacker News · IA",
    url: "https://hn.algolia.com/api/v1/search_by_date?query=" +
      encodeURIComponent("LLM OR OpenAI OR Anthropic OR Claude OR GPT") +
      "&tags=story&hitsPerPage=25",
    category: "community",
    kind: "hn-algolia",
  },

  // --- Startups ---
  {
    id: "techcrunch-startups",
    name: "TechCrunch Startups",
    url: "https://techcrunch.com/category/startups/feed/",
    category: "startups",
  },
  {
    id: "crunchbase-news",
    name: "Crunchbase News",
    url: "https://news.crunchbase.com/feed/",
    category: "startups",
  },
  { id: "producthunt", name: "Product Hunt", url: "https://www.producthunt.com/feed", category: "startups" },
  {
    id: "techcrunch-venture",
    name: "TechCrunch Venture",
    url: "https://techcrunch.com/category/venture/feed/",
    category: "startups",
  },
  {
    id: "ycombinator",
    name: "Y Combinator Blog",
    url: "https://www.ycombinator.com/blog/rss/",
    category: "startups",
  },
  {
    id: "launch-hn",
    name: "Launch HN",
    url: "https://hn.algolia.com/api/v1/search_by_date?query=%22Launch%20HN%22&tags=story&hitsPerPage=20",
    category: "startups",
    kind: "hn-algolia",
  },
  { id: "sifted", name: "Sifted", url: "https://sifted.eu/feed", category: "startups" },
  { id: "a16z", name: "a16z", url: "https://a16z.com/feed/", category: "startups" },
  { id: "contxto", name: "Contxto (LatAm)", url: "https://contxto.com/feed/", category: "startups" },

  // --- Negocios / empresas ---
  { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "business" },
  {
    id: "axios-tech",
    name: "Axios Tech",
    url: "https://api.axios.com/feed/technology",
    category: "business",
  },
  {
    id: "the-information",
    name: "The Information",
    url: "https://www.theinformation.com/feed",
    category: "business",
  },
  {
    id: "cnbc-tech",
    name: "CNBC Tech",
    url: "https://www.cnbc.com/id/19854910/device/rss/rss.html",
    category: "business",
  },
  {
    id: "fastcompany-tech",
    name: "Fast Company Tech",
    url: "https://www.fastcompany.com/technology/rss",
    category: "business",
  },
  { id: "venturebeat", name: "VentureBeat", url: "https://venturebeat.com/feed/", category: "business" },
  {
    id: "businessinsider-tech",
    name: "Business Insider Tech",
    url: "https://www.businessinsider.com/tech/rss",
    category: "business",
  },
  {
    id: "google-news-tech-es",
    name: "Google News · Tecnología (ES)",
    url: googleNewsSearchUrl("tecnología startups inteligencia artificial", "es"),
    category: "business",
  },
  { id: "xataka", name: "Xataka", url: "https://www.xataka.com/feedburner.xml", category: "business" },
  { id: "hipertextual", name: "Hipertextual", url: "https://hipertextual.com/feed", category: "business" },
  {
    id: "elpais-tec",
    name: "El País Tecnología",
    url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada",
    category: "business",
  },
  { id: "iproup", name: "iProUP", url: "https://www.iproup.com/rss", category: "business" },
  {
    id: "gdelt-es",
    name: "GDELT · Tech en español",
    url: gdeltUrl('("inteligencia artificial" OR startup OR tecnología) sourcelang:spanish'),
    category: "business",
    kind: "gdelt",
  },

  // --- Eventos ---
  {
    id: "confs-tech-general",
    name: `confs.tech · General ${YEAR}`,
    url: confsTechUrl("general"),
    category: "events",
    kind: "confs-tech",
  },
  {
    id: "confs-tech-data",
    name: `confs.tech · Data & ML ${YEAR}`,
    url: confsTechUrl("data"),
    category: "events",
    kind: "confs-tech",
  },
  {
    id: "techcrunch-events",
    name: "TechCrunch Events",
    url: "https://techcrunch.com/tag/events/feed/",
    category: "events",
  },
  {
    id: "google-news-events",
    name: "Google News · Eventos tech",
    url: googleNewsSearchUrl("(tech OR AI) AND (conference OR summit OR keynote OR hackathon)"),
    category: "events",
  },
  // YouTube channels also expose RSS (https://www.youtube.com/feeds/videos.xml?channel_id=...)
  // and are a good fit here for keynotes; add them once you have the exact channel_id.

  // --- Tech general ---
  { id: "techmeme", name: "Techmeme", url: "https://www.techmeme.com/feed.xml", category: "tech" },
  { id: "theverge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "tech" },
  {
    id: "arstechnica",
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "tech",
  },
  { id: "wired", name: "Wired", url: "https://www.wired.com/feed/rss", category: "tech" },
  { id: "engadget", name: "Engadget", url: "https://www.engadget.com/rss.xml", category: "tech" },
  {
    id: "the-register",
    name: "The Register",
    url: "https://www.theregister.com/headlines.atom",
    category: "tech",
  },
  {
    id: "hackernews",
    name: "Hacker News",
    url: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
    category: "tech",
    kind: "hn-algolia",
  },
];
