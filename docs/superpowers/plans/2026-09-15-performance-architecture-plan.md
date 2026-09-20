# Performance Architecture — Implementation Plan

- **Date:** 2026-09-15
- **Spec:** `docs/superpowers/specs/2026-09-15-performance-architecture-design.md`
- **Rule:** every step ends in a benchmark or a build check. No step is "done" on faith.

## Task 1 — Native link prefetch

**Change:** in `src/layouts/Base.astro` `<head>`, after the font preload, add:

```html
<script type="speculationrules" is:inline>
  { "prefetch": [{ "sources": "document", "eagerness": "moderate" }] }
</script>
```

**Verify:** built `dist/index.html` contains the tag verbatim; Chromium fires a prefetch on nav-link hover (automated in Task 4); `npm run check` passes.

## Task 2 — Performance gate script

**Changes:**
- `npm i -D puppeteer-core` (dev-only; nothing ships).
- `package.json` → `"perf": "npm run build && node scripts/perf-check.mjs"`.
- New `scripts/perf-check.mjs` (~100 lines):
  1. Resolve base path: `BASE_PATH` env, trailing slash stripped (root → `''`).
  2. Resolve Chrome: `CHROME_PATH` → `google-chrome-stable` → `google-chrome` → `chromium` → `chromium-browser`; none found → exit 1 with instruction.
  3. Assume `dist/` exists (workflow builds first; `npm run perf` builds locally). Spawn `node_modules/.bin/astro preview --host 127.0.0.1 --port 4390` with `BASE_PATH` inherited; poll `GET ${base}/` until 200 (30s); kill child on exit (`finally`).
  4. Per page in `[${base}/, ${base}/posts/]`, 3 runs: CDP session → `Network.setCacheDisabled(true)`, `Network.emulateNetworkConditions` (150ms latency, 200KB/s down, 100KB/s up), `Emulation.setCPUThrottlingRate(4)` → `goto` (waitUntil `load`) → collect FCP, LCP, CLS, `loadEventEnd`, wire bytes (`nav.transferSize` + Σ `resource.encodedBodySize`), request count → median.
  5. Budgets: FCP ≤ 700, LCP ≤ 700, load ≤ 900, CLS ≤ 0.1, bytes ≤ 95,000, requests ≤ 3. Print a markdown table; name every breached budget; exit 1 on breach or any infrastructure failure (server never ready, Chrome crash). Never pass silently.

## Task 3 — Wire the gate into CI

**Change:** `.github/workflows/deploy.yml`, new step in the build job after "Build the published site":

```yaml
- name: Performance gate
  run: node scripts/perf-check.mjs
  env:
    BASE_PATH: ${{ steps.pages.outputs.base_path }}
```

## Task 4 — Verification (the benchmark-driven proof)

1. **Green run:** `npm run perf` → exit 0; record the table.
2. **Negative test:** temporarily set byte budget to 50,000 → `node scripts/perf-check.mjs` (dist exists) → must exit 1 naming the byte budget → restore 95,000 → green again.
3. **Prefetch proof:** headless Chromium: enable Network, hover a `.site-nav` link, assert a request to its target URL appears before any click; then click and confirm navigation used the prefetched response. If headless hover doesn't trigger speculation rules, report honestly and fall back to tag-presence + parser acceptance (no console errors).
4. **Project check:** `npm run check` → PASS.

## Out of scope (per spec)

Font changes, CDN, client router, image pipeline code — deferred with triggers recorded in the spec.
