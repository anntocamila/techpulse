# TechPulse 📡

**En vivo: https://anntocamila.github.io/techpulse/**

Un briefing de **inteligencia artificial, startups, negocios, eventos y
tecnología** al estilo de la newsletter *Last Week in AI*: cada edición agrupa
las últimas noticias por tema, las resume y cita las fuentes. Debajo, un feed
en vivo con las ~75 fuentes crudas.

## Cómo funciona

```
GitHub Actions (2 veces por día, o a mano)
  └─ scripts/build-digest.ts
       1. lee las ~75 fuentes de src/data/feeds.ts server-side (sin CORS ni proxies)
       2. se queda con las últimas 48 h, deduplica, recorta a ~220 titulares
       3. Claude (claude-opus-5) agrupa por tema y escribe la edición en español,
          con salida estructurada (JSON validado con zod) y citas numeradas
       4. escribe public/digest.json + public/digests/<id>.json + index.json
  └─ commit del JSON → build de Vite → deploy a GitHub Pages
```

La web (`src/components/DigestView.tsx`) solo lee ese JSON: no llama a ningún
modelo desde el navegador, así que la API key nunca sale de GitHub.

**Sin `ANTHROPIC_API_KEY`** el script igual corre y produce una edición de
titulares agrupados por categoría (marcada como tal en la página), para que
nunca quede vacía.

### Configuración inicial

1. En el repo: **Settings → Secrets and variables → Actions → New repository
   secret**, nombre `ANTHROPIC_API_KEY`, valor tu key de
   [console.anthropic.com](https://console.anthropic.com/).
2. **Actions → "Build digest and deploy" → Run workflow** para generar la
   primera edición sin esperar al cron.

Cada corrida con Claude procesa ~200 titulares (unos 30-40k tokens de entrada
y 4-8k de salida). Con dos ediciones por día el costo mensual queda en el
orden de una suscripción a un newsletter; el cron está en
`.github/workflows/deploy.yml`.

Variables opcionales del script: `DIGEST_MODEL` (default `claude-opus-5`),
`DIGEST_WINDOW_HOURS` (48), `DIGEST_MAX_POSTS` (220). Para probarlo sin red:
`DIGEST_POSTS_FILE=posts.json npm run digest` con un array de `Post`.

## Funcionalidades del feed en vivo

- **Feed estilo timeline**: tarjetas con avatar de la fuente, título, resumen,
  imagen (cuando el feed la trae), categoría y tiempo relativo ("hace 3h").
- **Categorías**: IA, Labs IA, Startups, Negocios, Eventos, Tech, Comunidad —
  un mismo artículo puede aparecer en más de una si el título/resumen matchea
  varias.
- **Labs IA**: las empresas que hacen los modelos (OpenAI, Anthropic, Google
  DeepMind, Google AI/Research, Meta AI, Mistral, xAI, Perplexity, Cohere,
  Hugging Face, NVIDIA, Microsoft AI/Research, Apple ML, Amazon Science). Las
  que no publican RSS se siguen vía Google News.
- **APIs en vivo, sin proxy ni key**: Hugging Face (modelos trending y papers
  del día), GDELT (noticias globales cada 15 min, en inglés y español), Bluesky,
  dev.to, Hacker News (Algolia) y confs.tech (conferencias, datos abiertos).
  El navegador las llama directo, así que son las más "en tiempo real".
- **Comunidad**: newsletters y blogs que hoy marcan la agenda de IA (Import AI,
  The Batch, Interconnects, Simon Willison, Latent Space, One Useful Thing,
  Ben's Bites, Last Week in AI, Platformer) más Bluesky, dev.to y HN.
- **Eventos**: próximas conferencias desde confs.tech (con fecha, ciudad y CFP),
  ordenadas por cercanía, más TechCrunch Events y Google News.
- **Fuentes activables**: en el panel derecho podés apagar/prender cualquier
  fuente; se recuerda en tu navegador y aplica en la próxima actualización.
- **"Preguntá algo"**: escribís una pregunta en lenguaje natural y el
  orquestador la convierte en keywords, consulta en paralelo Google News
  (EN/ES), Bing News y Hacker News, y devuelve los resultados rankeados por
  relevancia + frescura. Ver `src/lib/search.ts` y `docs/PLAN.md` para la
  versión con LLM.
- **Filtro local** por palabra clave sobre título, resumen y fuente.
- **Auto-refresh** cada 10 minutos + botón de actualizar manual, con render
  progresivo (las fuentes aparecen a medida que responden) y cache local
  para que el feed cargue al instante al volver a abrir.
- **Sin backend propio**: el feed corre en el navegador y la edición la genera
  GitHub Actions. Todo se sirve como sitio estático desde GitHub Pages.
- Diseño responsive, tema claro tipo newsletter.

## Cómo funciona el agregador (`src/lib/rss.ts` y `src/lib/apis.ts`)

Las fuentes con API JSON (`kind` distinto de `"rss"` en `feeds.ts`) se llaman
directo desde el navegador: los parsers están en `src/lib/apis.ts`.

Los feeds RSS casi nunca tienen CORS, así que cada uno se intenta en tres pasos:

1. **Directo**, por si el feed sí manda CORS (arXiv, GitHub y algunos blogs).
2. **[rss2json.com](https://rss2json.com/)** (API gratuita, sin key) convierte
   el RSS a JSON con headers CORS abiertos.
3. Si falla, se usa un proxy CORS genérico
   (`api.allorigins.win`) para traer el XML crudo y parsearlo en el navegador
   con `DOMParser` (soporta RSS 2.0 y Atom).

Si ambas fallan para una fuente puntual, esa fuente simplemente no aporta
posts en ese ciclo (se loguea en consola y aparece listada en "Sin datos por
ahora" en el panel derecho) — el resto del feed sigue funcionando con
normalidad.

> Nota: estos proxies gratuitos pueden tener rate limits. Para un uso más
> intensivo/productivo, lo ideal es correr tu propio backend liviano que haga
> el fetch de los RSS server-side (evita CORS y rate limits de terceros).

## Agregar o quitar fuentes

Editá `src/data/feeds.ts`. Cada fuente es:

```ts
{ id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "business" }
```

Para una API JSON, agregá `kind` con uno de los parsers de `src/lib/apis.ts`
(`hn-algolia`, `hf-models`, `hf-papers`, `gdelt`, `bluesky`, `devto`,
`confs-tech`). Un canal de YouTube también sirve como RSS:
`https://www.youtube.com/feeds/videos.xml?channel_id=...`.

Las URLs se armaron sin poder verificarlas en vivo desde el entorno de
desarrollo: cualquier fuente que no responda aparece en "Sin datos por ahora"
en el panel derecho. Esa lista es la que hay que revisar y corregir.

`category` es la categoría "primaria" de la fuente. Además, `src/lib/categorize.ts`
le agrega tags extra por keyword (por ejemplo, si el título menciona "startup"
o "funding", ese post también aparece en el filtro correspondiente aunque la
fuente sea de otra categoría).

## Desarrollo

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build de producción en dist/
npm run preview   # sirve el build de producción
```

## Roadmap

En [`docs/PLAN.md`](docs/PLAN.md) está el plan de diseño (favicons reales,
color por categoría, trending, guardados, tema claro, mobile) y la
arquitectura del orquestador con LLM (planificar → buscar → rankear →
sintetizar con citas).

## Deploy

`.github/workflows/deploy.yml` corre en tres casos: push a `main` (solo
rebuild y deploy, reusa la edición ya commiteada), cron dos veces por día y
`workflow_dispatch` (regenera la edición, la commitea con `[skip ci]`, buildea
y despliega). El build usa `GITHUB_PAGES=true` para servir los assets bajo
`/techpulse/`.

La primera vez hay que activar Pages a mano: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Es un solo clic y después el deploy
es automático en cada push.

## Stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/)
- Sin dependencias de backend — 100% estático
