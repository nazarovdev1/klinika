import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

const NAV = [
  ['dashboard', '/'],
  ['patients', '/patients'],
  ['calendar', '/calendar'],
  ['queue', '/queue'],
  ['visits', '/visits'],
  ['billing', '/billing'],
  ['lab', '/lab'],
  ['reports', '/reports'],
  ['settings', '/settings'],
  ['integration', '/integration'],
] as const;

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <div className="flex min-h-screen">
      <nav aria-label="main" className="w-60 shrink-0 border-r border-border bg-muted p-4">
        <ul className="space-y-1">
          {NAV.map(([key, href]) => (
            <li key={key}>
              <Link href={href} className="block rounded-md px-3 py-2 hover:bg-background">
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
