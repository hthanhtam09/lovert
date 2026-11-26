import { ConvertImagePage } from '@/components/ConvertImagePage';
import { getTool } from '@/content/tools';
import { pageMetadata } from '@/lib/seo';

const tool = getTool('png-to-jpg');
export const metadata = pageMetadata({ path: tool.path, title: tool.title, description: tool.description });

export default function Page() {
  return <ConvertImagePage slug="png-to-jpg" />;
}
