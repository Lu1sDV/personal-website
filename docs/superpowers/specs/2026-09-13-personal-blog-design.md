# Personal blog architecture

## Decision

Build a static Astro personal blog, published through GitHub Pages. The user approved Astro and an antfu.me-inspired design, then requested a clean three-section site: Dashboard, Blog, and Projects. The visual draft chooser and alternate layouts are removed; unpublished article files are preserved.

## Visual direction

Use a custom design rather than a third-party theme. Recreate the reference's narrow approximately 656px reading column, sans-serif typography, generous whitespace, small unobtrusive navigation, monochrome light/dark palettes, understated links, and chronological archive with oversized faint year labels. The implementation and mark are original; do not copy Anthony Fu's signature, biography, or articles.

The site has three public sections:

- **Dashboard:** the profile-style homepage, with a short introduction, compact project/technology badges, and understated links to Blog and Projects.
- **Blog:** the existing chronological writing archive and article pages.
- **Projects:** an original-style project list — one flat 3-column card grid modeled on the reference layout (350px cards, 16px gap, 36px icon + title + description), listing real repositories from the author's GitHub rather than invented work.

Use the same thin, rounded-stroke **L** mark in the header and favicon. Navigation contains only Dashboard, Blog, and Projects, plus the theme control. Footer removed 2026-09-15 (previously "Blog / A personal notebook."); the RSS channel title now uses the `ls-ui` wordmark. All sections work at desktop and narrow mobile widths, in light and dark modes.

### Visual update (2026-09-15)

Inspired by antfu.me's use of brand-colored logos, with an original background treatment:

- **Accent color** `--accent: #ff5d01` (Astro brand orange), used only for the notebook icons (Dashboard badge and Projects list). Everything else stays monochrome.
- **Background**: flat base colors unchanged (`#fff` / `#050505` — the latter identical to the reference), plus a soft accent-tinted radial glow at the top of the page (`--glow`, 5% light / 8% dark). The reference itself is flat; the glow is this site's own addition.
- **Tech badges** (Dashboard "Built with") use official brand marks in brand colors, sourced from simple-icons: Astro `#ff5d01`, TypeScript `#3178c6`, CSS `#663399` (rebeccapurple). Marks are used nominatively to identify the named projects.
- **GitHub mark** stays monochrome (`currentColor`): GitHub's brand mark has no official color; coloring it would be off-brand.
- All icon changes are inline SVG — no new requests; the performance gate remains green (homepage wire bytes 81.7KB → 83.2KB, within the 95KB budget).
- **Wordmark**: header shows `ls-ui` (site config `wordmark`) in serif italic — `Georgia, 'Times New Roman', serif`, 16px, 400, `.02em`. Chosen 2026-09-15 from a 20-variation showroom (variation 13); no webfont added, platforms resolve their own serif. The `L` mark stays as the logo beside it.

The provisional site title is **Notes**. No public name, personal biography, email, social profile, or project history has been supplied; do not invent any. Introductory copy describes the purpose of the notebook without asserting credentials or achievements. Omit contact/social links until configured.

## Routes and content

- `/`: the profile-style Dashboard.
- `/posts/`: the Blog, grouped chronologically by year.
- `/posts/<slug>/`: article with title, description, publication date, reading time, Markdown typography, and syntax-highlighted code.
- `/projects/`: the Projects section.
- `/feed.xml`: RSS generated from the same visible-post collection used by pages.
- Sitemap and a useful 404 page.

The former `/drafts/`, `/drafts/reference/`, and `/drafts/compact/` routes are removed in both development and production. There are no replacement preview aliases.

Store Markdown posts in an Astro content collection. Validate title, description, date, and a boolean draft field. Write three original, complete but editable starter articles: **Why this space exists**, **Keeping useful notes**, and **Small websites, fewer moving parts**. Mark all three as unpublished drafts. Draft content must not make unsupported claims about the author's life or work.

Development mode includes unpublished articles in the Blog and labels them explicitly. Default production builds exclude draft articles, their archive entries, RSS items, and sitemap entries. Article visibility is implemented once in the content selection helper and reused by every consumer. A published site with no published articles is valid and displays an honest empty Blog state. Article authoring drafts are not a navigation section.

## Implementation boundaries

Use Astro components, Markdown, plain CSS, and one small browser script for theme selection. No React, Vue, Tailwind, CMS, comments, analytics, search, or server runtime. Use the official Astro RSS and sitemap packages rather than custom XML generation.

Keep site identity in a small configuration module. Shared components cover the document layout, header/footer, and post list; Dashboard and Projects content live in their page files. Content helpers handle article visibility, chronological ordering, reading-time calculation, and repository-base-path links. Add no generalized theme engine or framework adapters.

Theme defaults to the operating system's preference and supports an explicit saved choice. Storage failure must not prevent interaction or rendering. Core content and links work without JavaScript; visible keyboard focus, semantic headings, skip navigation, meaningful button labels, and reduced-motion support are required. Long code lines scroll within their block rather than overflowing the viewport.

## Publishing

The `.github/workflows/deploy.yml` workflow builds Astro and deploys a GitHub Pages artifact on pushes to main or manual runs. Determine the canonical origin and repository base path from the Pages configuration action, supporting user sites, repository sites, and custom domains without hardcoding a username. Set the Pages publishing source to GitHub Actions when connecting the repository.

Use npm with a committed lockfile and a supported Node version. Local commands cover development, production build, and production preview. Local builds default to the local origin when no deployment URL is supplied. Keep agent metadata, dependency directories, and generated output outside the publication artifact. Obsolete Hugo configuration and visual-preview code have been removed; unrelated metadata remains untouched.

## Verification and acceptance

1. Run the real Astro development server and view Dashboard, Blog, Projects, and an article in Chromium.
2. Visually verify desktop and mobile layouts, light and dark themes, and article/code typography. Exercise theme switching, persistence, navigation, and keyboard focus.
3. Build and serve production output. Confirm unpublished articles are absent from pages, RSS, and sitemap; verify the empty Blog state, removed preview URLs, and custom 404 page.
4. Build at a repository subpath and exercise navigation/assets from that prefix. Verify canonical and feed/sitemap URLs use the configured origin and base path.
5. Keep one small runnable regression check guarding the draft-publication boundary and subpath-safe generated links. Do not add a test framework or broad component test suite.

GitHub deployment itself cannot be claimed until a real remote repository is configured and an Actions run succeeds. Local verification establishes publish-ready output, not a live deployment.

## Implementation structure

- `src/pages/index.astro`: the profile-style Dashboard.
- `src/pages/posts/`: the Blog archive and individual article routes.
- `src/pages/projects/index.astro`: project entries.
- `src/layouts/Base.astro`, `src/components/Header.astro`, and `src/components/Footer.astro`: shared metadata, three-section navigation, and site footer.
- `src/components/PostList.astro`: the year-grouped writing list.
- `src/lib/posts.ts`: the common article visibility, ordering, and reading-time rules.
- `src/lib/urls.ts`: internal links that respect a repository base path.
- `scripts/check-build.mjs`: isolated root/subpath publication-boundary checks.

There is no `Home` variant component, draft chooser, or separate dashboard mock route. The actual Dashboard is the homepage.

## Running and publishing

Use the Node version in `.node-version` (22.22.2), or another version supported by the package's `engines` field.

```sh
npm ci
npm run dev
```

Development runs at `http://127.0.0.1:4321/`: Dashboard at `/`, Blog at `/posts/`, and Projects at `/projects/`. The Blog includes the three labeled unpublished articles in development.

```sh
npm run check
npm run build
npm run preview
```

`check` builds an isolated copy under `.astro/` at both `/` and `/blog/`, using temporary published/unpublished articles. It verifies rendered content, draft exclusion (including generated scripts/data), working internal links/assets, RSS, sitemap, and canonical URLs. It never inserts fixtures into the real content directory, and deletes the scratch project when finished. Build output remains on the same filesystem because Astro moves assets using `rename`.

`build` creates the real production site in `dist/`. `preview` serves that output without unpublished articles. With the supplied content, the public Blog is intentionally empty; Dashboard and Projects are available. Removed visual-preview URLs return 404.

Edit `src/site.ts` to replace the provisional title and description. Dashboard copy lives in `src/pages/index.astro`; project entries live in `src/pages/projects/index.astro`. The L mark is in `src/components/Header.astro` and `public/favicon.svg`. Inter is bundled locally; its license is distributed in `public/fonts-OFL.txt`. Add personal social/contact links only when real destinations have been provided.

To publish an article, edit its Markdown file in `src/content/posts/`, update `pubDate`, and set `draft: false`. All four frontmatter fields (`title`, `description`, `pubDate`, `draft`) are required. If the article links to another draft, publish that linked article or remove the link; `npm run check` rejects broken internal links. A public GitHub repository exposes Markdown source, including drafts: excluding a draft from the website is not access control.

Connect the project to your GitHub repository and push it to `main`. In the repository's **Settings → Pages**, set **Source → GitHub Actions**. The workflow installs locked dependencies, runs the publication check, builds using the Pages-provided origin/base path, and deploys only `dist/`. User sites, repository subpaths, and Pages-configured custom domains use the same workflow. No remote repository or live deployment was configured during this implementation.

For a local deployment-style build, `SITE_URL` sets the public origin and `BASE_PATH` sets the repository prefix. These are supplied automatically in Actions. Local defaults are `http://localhost:4321` and `/`.

## Delivered verification

- `npm run check`: passed for root and repository-subpath builds with isolated fixtures.
- `npm run build`: passed; Dashboard, Blog, and Projects are published, while the starter articles remain unpublished.
- Chromium: all three sections checked at 320, 390, 768, and 1440px without page overflow, with the correct active navigation item.
- Light/dark rendering, the L mark, removed footer subscription link, and the real project listing were visually checked.
- The former visual-preview routes return 404 in development and production.
- Production HTTP checks: all three public sections return 200; unpublished article URLs return 404; RSS is valid and excludes drafts; sitemap lists only the three public sections.

## Sources

- Visual reference: https://antfu.me/, https://antfu.me/posts, and https://antfu.me/projects
- Reference implementation manifest: https://raw.githubusercontent.com/antfu/antfu.me/main/package.json
- Astro architecture: https://docs.astro.build/en/concepts/why-astro/
- Astro GitHub Pages deployment: https://docs.astro.build/en/guides/deploy/github/
