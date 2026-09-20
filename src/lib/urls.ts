// BASE_URL has no trailing slash when `base` is a subpath (e.g. /personal-website on
// GitHub Pages), so normalise it to exactly one before joining, or every link loses the
// separator: /personal-websiteposts/. It is already "/" for root deploys and local dev.
export function withBase(path = ''): string {
  return `${import.meta.env.BASE_URL.replace(/\/*$/, '/')}${path.replace(/^\//, '')}`;
}
