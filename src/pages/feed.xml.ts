import type { APIRoute } from 'astro';
import rss from '@astrojs/rss';
import { getPosts } from '../lib/posts';
import { withBase } from '../lib/urls';
import { site } from '../site';

export const GET: APIRoute = async ({ site: origin }) => {
  if (!origin) throw new Error('RSS requires a configured Astro site URL.');

  const posts = await getPosts();
  return rss({
    title: site.wordmark,
    description: site.description,
    site: new URL(withBase(), origin).href,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: new URL(withBase(`posts/${post.id}/`), origin).href,
    })),
    customData: '<language>en</language>',
  });
};
