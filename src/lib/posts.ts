import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'posts'>;

export async function getPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) =>
    b.data.pubDate.getTime() - a.data.pubDate.getTime()
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function readingTime(post: BlogPost): number {
  // ponytail: Markdown word count is an estimate, not a second content parser.
  const words = post.body?.match(/\S+/g)?.length ?? 0;
  return Math.max(1, Math.ceil(words / 220));
}
