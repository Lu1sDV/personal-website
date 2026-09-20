#!/usr/bin/env node
// Performance gate: benchmarks the built site under a simulated slow mobile
// profile and fails (exit 1) if any budget is breached. Never passes silently.
// Usage: node scripts/perf-check.mjs   (requires ./dist; `npm run perf` builds first)
// Budgets per docs/superpowers/specs/2026-09-15-performance-architecture-design.md
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const BUDGETS = { fcp: 700, lcp: 700, load: 900, cls: 0.1, bytes: 95_000, requests: 3 };
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const PAGES = ['/', '/posts/'];
const RUNS = 3;
const HOST = '127.0.0.1';
const PORT = 4390;
const ORIGIN = `http://${HOST}:${PORT}`;

const fail = (msg) => { console.error(`perf-check: ${msg}`); process.exit(1); };
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '') || '';

function findChrome() {
  for (const c of [process.env.CHROME_PATH, 'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    if (!c) continue;
    if (existsSync(c)) return c;
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  fail('no Chrome/Chromium found; set CHROME_PATH');
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${ORIGIN}${base || '/'}`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  fail(`preview server not ready on ${ORIGIN} within ${timeoutMs}ms`);
}

async function measurePage(page, path) {
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${ORIGIN}${base}${path}`, { waitUntil: 'load', timeout: 60_000 });
  await new Promise(r => setTimeout(r, 400));
  const m = await page.evaluate(async () => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
    let lcp = 0, cls = 0;
    await new Promise(resolve => {
      try {
        new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) lcp = e[e.length - 1].startTime; })
          .observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}
      try {
        new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; })
          .observe({ type: 'layout-shift', buffered: true });
      } catch {}
      setTimeout(resolve, 250);
    });
    const resources = performance.getEntriesByType('resource');
    return {
      fcp: Math.round(fcp?.startTime ?? 0),
      lcp: Math.round(lcp),
      load: Math.round(nav.loadEventEnd),
      cls: +cls.toFixed(4),
      bytes: nav.transferSize + resources.reduce((s, r) => s + r.encodedBodySize, 0),
      requests: resources.length,
    };
  });
  await cdp.detach();
  return m;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

if (!existsSync('dist')) fail('./dist not found — run `npm run build` first (or `npm run perf`)');
const chromePath = findChrome();

// Astro 7 daemonizes `preview` — clear any stale daemon, then start ours.
spawnSync('node_modules/.bin/astro', ['preview', 'stop'], { stdio: 'ignore' });
const server = spawn('node_modules/.bin/astro', ['preview', '--host', HOST, '--port', String(PORT)], {
  stdio: 'ignore', env: process.env,
});
server.on('error', (e) => fail(`astro preview failed to start: ${e.message}`));

const browser = await puppeteer.launch({
  executablePath: chromePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  await waitForServer();
  const rows = [];
  for (const path of PAGES) {
    const page = await browser.newPage();
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measurePage(page, path));
    await page.close();
    rows.push({
      page: `${base}${path}`,
      fcp: median(runs.map(r => r.fcp)), lcp: median(runs.map(r => r.lcp)),
      load: median(runs.map(r => r.load)), cls: median(runs.map(r => r.cls)),
      bytes: median(runs.map(r => r.bytes)), requests: median(runs.map(r => r.requests)),
    });
  }

  console.log('| page | FCP | LCP | load | CLS | wire bytes | requests |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows)
    console.log(`| ${r.page} | ${r.fcp}ms | ${r.lcp}ms | ${r.load}ms | ${r.cls} | ${r.bytes}B | ${r.requests} |`);

  const breaches = [];
  for (const r of rows) for (const [k, limit] of Object.entries(BUDGETS))
    if (r[k] > limit) breaches.push(`${r.page}: ${k}=${r[k]} exceeds budget ${limit}`);
  if (breaches.length) {
    console.error('\nPERF GATE FAILED:\n' + breaches.map(b => `  - ${b}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nall performance budgets passed');
  }
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  spawnSync('node_modules/.bin/astro', ['preview', 'stop'], { stdio: 'ignore' });
}
