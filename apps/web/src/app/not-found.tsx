import Link from 'next/link';
import { TOOLS } from '@/content/tools';

export const metadata = { title: 'Page not found', robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <div className="prose page-head">
      <h1>Page not found</h1>
      <p>That page does not exist. Try one of the tools:</p>
      <ul>
        {TOOLS.map((t) => (
          <li key={t.slug}>
            <Link href={t.path}>{t.navLabel}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
