import type { MetadataRoute } from 'next';

import { Locale } from '@app/shared';

import { getPublicLevels } from '@/lib/catalog';
import { absoluteUrl } from '@/lib/site-url';

const locales = Object.values(Locale);

function entry(locale: Locale, path: string): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(`/${locale}${path}`),
    alternates: {
      languages: Object.fromEntries(
        locales.map((locale) => [locale, absoluteUrl(`/${locale}${path}`)]),
      ),
    },
  };
}

/**
 * Every locale of the home page and of each published level. When the API is
 * unreachable the sitemap still lists the home page rather than failing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getPublicLevels();
  const slugs = catalog.status === 'ok' ? catalog.data.map((l) => l.slug) : [];
  const paths = ['', ...slugs.map((slug) => `/levels/${slug}`)];

  return paths.flatMap((path) => locales.map((locale) => entry(locale, path)));
}
