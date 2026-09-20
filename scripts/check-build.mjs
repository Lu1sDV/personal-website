import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Astro moves build assets with rename, so temporary output must share its filesystem.
await mkdir(join(root, '.astro'), { recursive: true });
const output = await mkdtemp(join(root, '.astro/publication-'));
const project = join(output, 'project');
const id = randomUUID();
const publicSlug = `check-public-${id}`;
const privateSlug = `check-private-${id}`;
const fixtures = [publicSlug, privateSlug].map((slug) => join(project, 'src/content/posts', `${slug}.md`));
const origin = 'https://example.org';

try {
  await mkdir(project);
  for (const file of ['src', 'public', 'astro.config.mjs', 'package.json', 'tsconfig.json']) {
    await cp(join(root, file), join(project, file), { recursive: true });
  }
  for (const [index, file] of fixtures.entries()) {
    const marker = index ? privateSlug : publicSlug;
    await writeFile(file, `---\ntitle: ${marker}\ndescription: Publication boundary verification.\npubDate: 2000-01-01\ndraft: ${Boolean(index)}\n---\n\n${marker}\n`, { flag: 'wx' });
  }

  for (const base of ['/', '/blog/']) {
    const destination = join(output, base === '/' ? 'root' : 'subpath');
    execFileSync(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', destination], {
      cwd: project,
      env: { ...process.env, SITE_URL: origin, BASE_PATH: base },
      stdio: 'inherit',
    });

    const published = await readFile(join(destination, 'posts', publicSlug, 'index.html'), 'utf8');
    assert(published.includes(publicSlug), 'Published article must be rendered.');
    assert(!existsSync(join(destination, 'posts', privateSlug)), 'Draft article must have no public route.');
    assert(!existsSync(join(destination, 'drafts')), 'Design previews must not be published.');

    const feed = await readFile(join(destination, 'feed.xml'), 'utf8');
    const articleUrl = `${origin}${base}posts/${publicSlug}/`;
    assert(feed.includes(articleUrl), 'RSS must include the published article with its configured origin and base path.');
    const sitemap = await readFile(join(destination, 'sitemap-0.xml'), 'utf8');
    assert(sitemap.includes(articleUrl), 'Sitemap must include the published article at its real URL.');
    const canonical = [...published.matchAll(/<link\b[^>]*>/g)].find(([tag]) => /\brel="canonical"/.test(tag))?.[0];
    assert(canonical?.includes(`href="${articleUrl}"`), 'Article canonical must include the configured origin and base path.');

    const pages = (await readdir(destination, { recursive: true })).filter((file) => /\.(html|xml|m?js|json|map)$/.test(file));
    for (const file of pages) {
      const document = await readFile(join(destination, file), 'utf8');
      assert(!document.includes(privateSlug), `Draft leaked into ${file}.`);
      if (!file.endsWith('.html')) continue;
      const pageUrl = `${origin}${base}${file.replace(/index\.html$/, '')}`;
      for (const [, value] of document.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        if (value.startsWith('#')) continue;
        const url = new URL(value, pageUrl);
        if (url.origin !== origin) continue;
        assert(url.pathname.startsWith(base), `${file}: link escapes the repository base: ${value}`);
        const relative = decodeURIComponent(url.pathname.slice(base.length));
        const target = join(destination, relative, url.pathname.endsWith('/') ? 'index.html' : '');
        assert(existsSync(target), `${file}: missing link or asset ${value}`);
      }
    }
    console.log(`PASS ${base}: published article, hidden drafts/previews, RSS, sitemap, canonical, and local links.`);
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
