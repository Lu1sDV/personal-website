# Performance Architecture Design

- **Date:** 2026-09-15
- **Status:** Awaiting review
- **Scope:** Keep the personal blog measurably fast, permanently, without changing its look.

## Goals

1. Performance is enforced, not hoped for: every deploy is benchmarked in CI and fails on regression.
2. Zero visual change — the Inter font subset stays exactly as shipped.
3. No new runtime dependencies; executable client JavaScript limited to the existing ~0.7KB theme code plus the ~350B intent-prefetch snippet in §1.

## Non-goals

- CDN / delivery-layer changes (deferred, see triggers).
- Reducing font size (explicitly declined 2026-09-15).
- Client-side routing / view transitions (rejected: ~3KB framework to navigate four ~5.5KB pages; native prefetch below covers the perceived win).

## Baseline (measured 2026-09-15)

Method: production build → `astro preview` → headless Chromium via CDP, throttled to a slow mobile profile — 150ms RTT, 1.6Mbps down, 4× CPU slowdown, cache disabled — 3 runs per page, medians.

| Scenario | First paint (FCP/LCP) | Fully loaded | CLS | Wire bytes |
|---|---|---|---|---|
| Cold `/` | 532ms | 719ms | 0 | 5,486B HTML + 75,956B font |
| Cold `/posts/` | 480ms | 706ms | 0 | same font + smaller HTML |
| Warm `/` (repeat visit) | 456ms | 326ms | 0 | ~300B revalidation |
| Interaction (theme toggle) | 1ms | — | — | — |

Site composition: 4 static pages, 1 network request beyond the HTML (the font), CSS inlined into HTML, no images, no third-party requests, no framework JavaScript.

## Decisions (user, 2026-09-15)

1. **Font:** keep the current 76KB Inter subset unchanged.
2. **Delivery layer:** defer Cloudflare until real returning-visitor traffic exists.
3. **CI performance gate:** approved — build it.

## Architecture

### 1. Intent-based link prefetch (only runtime change)

A ~350B inline snippet in `src/layouts/Base.astro` `<head>`: on `pointerover`/`focusin` over an internal link, inject `<link rel="prefetch">` once per link.

- Verified end-to-end locally (Chromium 152, CDP network observation): hover fires the prefetch; the subsequent navigation transfers ~300B (revalidation) instead of ~5KB (full download).
- Works in Chromium and Firefox; Safari ignores `link rel=prefetch` and navigates normally.
- Deliberate, documented exception to goal 3: passive listeners, no framework, no dependency.
- **Rejected alternative — Speculation Rules** (`sources: ["document"], eagerness: "moderate"`): the local Chromium build never executes document-source rules (tested as shipped, with corrected array syntax, with `eagerness: "immediate"`, with explicit `where`, headless and headful — all inert), while explicit-URL list rules do fire. List rules are immediate-only — they would spend visitor bytes without intent. The unverifiable tag was removed in favor of the mechanism that could be proven.

### 2. CI performance gate (the permanent "benchmark driven" part)

- **Files:** `scripts/perf-check.mjs`; `package.json` gains `scripts.perf`; devDependency `puppeteer-core` (dev-only — nothing ships to visitors).
- **Flow:** serve the production `dist/` via `astro preview` on a fixed local port → launch system Chrome (`CHROME_PATH` override; runners ship chrome-stable) → apply the exact baseline profile above (CDP network + CPU throttling, cache disabled) → 3 runs on `/` and `/posts/`, medians → print a markdown table.
- **Budgets (hard-fail the build):**
  - FCP ≤ 700ms, LCP ≤ 700ms, load ≤ 900ms, CLS ≤ 0.1
  - total wire bytes ≤ 95,000B, requests beyond HTML ≤ 3
  - ~30% headroom over baseline absorbs runner-hardware variance.
- **Wiring:** `deploy.yml` build job, after `npm run build`, before artifact upload. `npm run perf` works locally.
- **Error handling:** Chrome missing, server not ready, or a crashed run exits non-zero with the reason — the gate never passes silently.

### 3. Content-readiness conventions (no code until the first image exists)

- Post images go through Astro's image pipeline (relative paths in Markdown) → optimized formats with intrinsic dimensions set (no CLS).
- Below-the-fold images: lazy + async decoding (Astro defaults). A hero/first-screen image: eager, `fetchpriority="high"`.
- Enforcement is mechanical: the byte and request budgets above fail CI if an illustrated post ships heavy assets.

### 4. Deferred decisions, with triggers

| Decision | Trigger | Notes |
|---|---|---|
| Cloudflare free tier in front of GitHub Pages | Analytics installed and showing meaningful returning visitors | Fixes the 10-minute `max-age=600` cache and gzip-only compression (no Brotli on Pages). Setup: proxied DNS, long edge TTL for `/_astro/*`, Browser-TTL override; GitHub cert issuance requires DNS-only (or Full SSL) during validation. |
| Font trim (~50KB via pinning optical size) or system stack (0KB, ~350ms cold load) | Cold-load speed ever outranks exact typography | Options documented; today's answer is "keep". |
| Astro ClientRouter / view transitions | Site grows interactive cross-page state | Rejected for 4 tiny pages; native prefetch already covers perceived speed. |

## Testing / verification

- Gate proves itself in the implementation plan via a **negative test**: run green on the current site, then temporarily set a byte budget below the current footprint and confirm the script fails. Restore budgets, rerun green.
- Prefetch: verify in Chromium (hover a nav link → Network panel shows the prefetch; navigation then served from cache). Confirm Firefox ignores the tag without errors.

## Risks

- Gate proven by negative test: green on the current site; byte budget temporarily tightened below the real footprint → exit 1 naming the breach; restored → green.
- Prefetch proven by CDP network observation: hover → prefetch request fires; click → navigation transfers ~300B revalidation instead of ~5KB.
- `link rel=prefetch` is ignored by Safari — accepted gap, degrades to plain navigation. Gate's daemon cleanup (`astro preview stop`) stops any project preview daemon, including one a developer left running.

## Sources

- GitHub Pages `max-age=600`, no header control — [GitHub Support via WebApps SE](https://webapps.stackexchange.com/questions/119286/caching-assets-in-website-served-from-github-pages), [community discussion #11884](https://github.com/orgs/community/discussions/11884)
- No Brotli on GitHub Pages — [community discussion #21655](https://github.com/orgs/community/discussions/21655)
- Cloudflare compression (Gzip/Brotli/Zstandard) and Cache Rules — [docs](https://developers.cloudflare.com/speed/optimization/content/compression), [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules)
- Replacing Astro ClientRouter with Speculation Rules — [joost.blog, 2026-04-22](https://joost.blog/replacing-astro-clientrouter/)
- Astro view transitions cost — [Chrome for Developers](https://developer.chrome.com/blog/astro-view-transitions), [Astro docs](https://docs.astro.build/en/guides/view-transitions)
