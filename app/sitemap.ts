import type { MetadataRoute } from 'next';
import { publicPages, SITE_ORIGIN } from '@/lib/public-site';

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(publicPages).map(({ path }) => ({
    url: SITE_ORIGIN + path,
  }));
}
