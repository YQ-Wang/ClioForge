import { requestLocale } from '@/lib/i18n/request';
import { publicMetadata } from '@/lib/public-site';
import PublicSite from '../public-site';

export async function generateMetadata() {
  return publicMetadata('guide', await requestLocale());
}
export default function Guide() {
  return <PublicSite page="guide" />;
}
