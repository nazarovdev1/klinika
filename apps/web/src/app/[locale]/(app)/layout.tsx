'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';

/** Each entry is shown when the user holds at least one of the listed permissions ([] = everyone). */
const NAV: readonly (readonly [string, string, readonly string[]])[] = [
  ['dashboard', '/', []],
  ['patients', '/patients', ['patients:read']],
  ['calendar', '/calendar', ['scheduling:read']],
  ['queue', '/queue', ['queue:manage']],
  ['visits', '/visits', ['encounters:read']],
  ['billing', '/billing', ['billing:read']],
  ['lab', '/lab', ['encounters:read', 'lab:write', 'lab:validate']],
  ['reports', '/reports', ['reports:read']],
  ['settings', '/settings', ['settings:manage', 'staff:manage', 'catalog:write']],
  ['integration', '/integration', ['settings:manage']],
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const c = useTranslations('common');
  const { user, loading, can, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.mustChangePassword) router.replace('/change-password');
  }, [loading, user, router]);

  if (loading || !user || user.mustChangePassword) {
    return <p className="p-6">{c('loading')}</p>;
  }

  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="main"
        className="flex w-60 shrink-0 flex-col border-r border-border bg-muted p-4"
      >
        <ul className="flex-1 space-y-1">
          {NAV.filter(([, , perms]) => perms.length === 0 || perms.some((p) => can(p))).map(
            ([key, href]) => (
              <li key={key}>
                <Link
                  href={href}
                  className="block rounded-md px-3 py-2 hover:bg-background"
                  aria-current={pathname === href ? 'page' : undefined}
                >
                  {t(key)}
                </Link>
              </li>
            ),
          )}
        </ul>
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <p className="truncate font-medium">{user.fullName}</p>
          <p className="flex gap-2">
            {(['uz', 'ru'] as const).map((l) => (
              <Link
                key={l}
                href={pathname}
                locale={l}
                className={l === locale ? 'font-semibold underline' : 'text-muted-foreground'}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </p>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              void logout().then(() => {
                router.replace('/login');
              });
            }}
          >
            {c('logout')}
          </button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
