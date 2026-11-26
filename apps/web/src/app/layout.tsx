import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { NavLinks } from '@/components/NavLinks';
import { Wordmark } from '@/components/Wordmark';
import { INFO_PAGES, TOOLS } from '@/content/tools';
import { site, SITE_NAME } from '@/lib/site';
import './globals.css';

const sans = Space_Grotesk({ subsets: ['latin', 'latin-ext', 'vietnamese'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  ...(site.origin ? { metadataBase: new URL(site.origin) } : {}),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  applicationName: SITE_NAME,
  robots: site.isProduction ? { index: true, follow: true } : { index: false, follow: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

const NAV = [{ href: '/', label: 'All tools' }, ...TOOLS.filter((t) => t.featured).map((t) => ({ href: t.path, label: t.navLabel })), { href: '/blog', label: 'Guides' }];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions often inject attributes into <html>/<body> before hydration.
    // suppressHydrationWarning only ignores these two elements' own attributes, not their children.
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="brand">
              <Logo size={34} />
              <Wordmark />
            </Link>
            <nav className="nav" aria-label="File tools">
              <NavLinks links={NAV} />
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap">
            <ul>
              {TOOLS.map((t) => (
                <li key={t.slug}>
                  <Link href={t.path}>{t.navLabel}</Link>
                </li>
              ))}
              {INFO_PAGES.map((p) => (
                <li key={p.path}>
                  <Link href={p.path}>{p.navLabel}</Link>
                </li>
              ))}
            </ul>
            <p>Both tools process files in your browser. Files are not uploaded.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
