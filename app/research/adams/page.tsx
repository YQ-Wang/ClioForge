import { requestLocale } from '@/lib/i18n/request';
import { publicMetadata } from '@/lib/public-site';
import PublicSite from '../../public-site';

export async function generateMetadata() {
  return publicMetadata('adams', await requestLocale());
}
export default function AdamsCase() {
  return <PublicSite page="adams" />;
}
