'use client';

import {
  BarChart3,
  CalendarDays,
  FlaskConical,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Plug,
  Settings,
  Stethoscope,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

type NavItem = readonly [key: string, href: string, icon: LucideIcon, perms: readonly string[]];
/** Groups are separated by hairlines; an item shows when the user holds one of its permissions ([] = all). */
const GROUPS: readonly (readonly NavItem[])[] = [
  [
    ['dashboard', '/', LayoutDashboard, []],
    ['patients', '/patients', Users, ['patients:read']],
    ['calendar', '/calendar', CalendarDays, ['scheduling:read']],
    ['queue', '/queue', ListOrdered, ['queue:manage']],
  ],
  [
    ['visits', '/visits', Stethoscope, ['encounters:read']],
    ['billing', '/billing', Wallet, ['billing:read']],
    ['lab', '/lab', FlaskConical, ['encounters:read', 'lab:write', 'lab:validate']],
  ],
  [
    ['reports', '/reports', BarChart3, ['reports:read']],
    ['settings', '/settings', Settings, ['settings:manage', 'staff:manage', 'catalog:write']],
    ['integration', '/integration', Plug, ['settings:manage']],
  ],
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const c = useTranslations('common');
  const { user, loading, can, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.mustChangePassword) router.replace('/change-password');
  }, [loading, user, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading || !user || user.mustChangePassword) {
    return (
      <div className="grid min-h-screen place-items-center text-ink-2" role="status">
        {c('loading')}
      </div>
    );
  }

  const nav = (
    <nav aria-label="main" className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {GROUPS.map((group, gi) => {
          const items = group.filter(
            ([, , , perms]) => perms.length === 0 || perms.some((p) => can(p)),
          );
          if (items.length === 0) return null;
          return (
            <ul key={gi} className={cn('space-y-0.5 py-2', gi > 0 && 'border-t border-line')}>
              {items.map(([key, href, Icon]) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[14px] no-underline transition-colors',
                        active
                          ? 'bg-primary-soft font-medium text-primary-hover'
                          : 'text-ink hover:bg-row-hover hover:text-ink',
                      )}
                    >
                      <Icon
                        size={18}
                        aria-hidden
                        className={active ? 'text-primary' : 'text-ink-2'}
                      />
                      {t(key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </div>
      <div className="space-y-2 border-t border-line p-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{user.fullName}</p>
          <p className="truncate text-[12px] text-ink-2">{user.role}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="flex gap-1" aria-label={c('language')}>
            {(['uz', 'ru'] as const).map((l) => (
              <Link
                key={l}
                href={pathname}
                locale={l}
                className={cn(
                  'rounded-control px-2 py-0.5 text-[12px] font-medium no-underline',
                  l === locale ? 'bg-ink text-white' : 'text-ink-2 hover:bg-row-hover',
                )}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-[13px] text-ink-2 hover:bg-row-hover hover:text-ink"
            onClick={() => {
              void logout().then(() => {
                router.replace('/login');
              });
            }}
          >
            <LogOut size={15} aria-hidden />
            {c('logout')}
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-r border-line bg-surface lg:block">
        {nav}
      </aside>

      <header className="flex h-12 items-center gap-3 border-b border-line bg-surface px-3 lg:hidden">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="grid h-9 w-9 place-items-center rounded-control hover:bg-row-hover"
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
        >
          {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
        <Logo />
      </header>
      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-30 w-64 border-r border-line bg-surface shadow-[0_8px_24px_rgba(31,42,48,0.12)] lg:hidden">
          {nav}
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-5 lg:px-6">
        <div className="mx-auto max-w-[1480px]">{children}</div>
      </main>
    </div>
  );
}
