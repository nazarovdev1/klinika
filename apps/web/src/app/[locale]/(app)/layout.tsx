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

  const navFor = (rail: boolean) => (
    <nav aria-label="main" className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center px-4', rail && 'justify-center px-1')}>
        <Logo onDark className={rail ? 'gap-1.5 [&>span:last-child]:text-[16px]' : ''} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {GROUPS.map((group, gi) => {
          const items = group.filter(
            ([, , , perms]) => perms.length === 0 || perms.some((p) => can(p)),
          );
          if (items.length === 0) return null;
          return (
            <ul key={gi} className={cn('space-y-0.5 py-2', gi > 0 && 'border-t border-white/15')}>
              {items.map(([key, href, Icon]) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center rounded-control no-underline transition-colors',
                        rail
                          ? 'flex-col gap-1 px-0.5 py-2 text-center text-[11.5px] leading-tight'
                          : 'h-9 gap-2.5 px-2.5 text-[14px]',
                        active
                          ? 'bg-white font-medium text-rail hover:text-rail'
                          : 'text-rail-ink hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <Icon size={rail ? 20 : 18} className="shrink-0" aria-hidden />
                      {t(key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </div>
      <div className="space-y-2 border-t border-white/15 p-2 text-rail-ink">
        <div className={cn('min-w-0', rail && 'text-center')} title={user.fullName}>
          <p className="truncate text-[13px] font-medium text-white">{user.fullName}</p>
          <p className="truncate text-[12px]">{user.role}</p>
        </div>
        <div className={cn('flex items-center justify-between', rail && 'flex-col gap-1')}>
          <p className="flex gap-1" aria-label={c('language')}>
            {(['uz', 'ru'] as const).map((l) => (
              <Link
                key={l}
                href={pathname}
                locale={l}
                className={cn(
                  'rounded-control px-2 py-0.5 text-[12px] font-medium no-underline',
                  l === locale
                    ? 'bg-white text-rail'
                    : 'text-rail-ink hover:bg-white/10 hover:text-white',
                )}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-[13px] hover:bg-white/10 hover:text-white"
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
      <aside className="sticky top-0 hidden h-screen w-[96px] shrink-0 bg-rail lg:block">
        {navFor(true)}
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
        <div className="fixed inset-x-0 bottom-0 top-12 z-30 w-64 bg-rail shadow-[0_8px_24px_rgba(31,42,48,0.12)] lg:hidden">
          {navFor(false)}
        </div>
      )}

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
