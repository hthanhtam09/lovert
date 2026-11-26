'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <ul>
      {links.map((l) => {
        const current = path === l.href;
        return (
          <li key={l.href}>
            <Button
              asChild
              variant="ghost"
              className={current ? 'h-11 bg-accent px-3 font-semibold text-accent-foreground' : 'h-11 px-3 font-semibold text-muted-foreground'}
            >
              <Link href={l.href} aria-current={current ? 'page' : undefined}>
                {l.label}
              </Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
