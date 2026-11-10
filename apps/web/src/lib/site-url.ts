/** Public origin of the site, used for canonical URLs, the sitemap and OG. */
export function siteUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}
