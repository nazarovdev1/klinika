import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Title row: page title left, the single primary action(s) right. */
export function PageHeader({
  title,
  children,
  sub,
}: {
  title: string;
  children?: ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 [&>*]:whitespace-nowrap">{children}</div>
      )}
    </div>
  );
}

/** Row of filters / controls above a table. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-3 flex flex-wrap items-end gap-3', className)}>{children}</div>;
}

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[14px] text-ink-2">
      <Icon size={20} aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** Master/detail layout: list on the left, a detail panel on the right (non-modal). */
export function Split({
  children,
  panel,
  open,
}: {
  children: ReactNode;
  panel: ReactNode;
  open: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">{children}</div>
      {open && (
        <aside className="sticky top-4 w-[420px] shrink-0 max-[1100px]:w-[360px]">{panel}</aside>
      )}
    </div>
  );
}

/** Plain KPI strip: one bordered row with hairline dividers, no tiles. */
export function KpiStrip({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: string }[];
}) {
  return (
    <dl className="mb-4 grid grid-cols-2 divide-line rounded-card border border-line bg-surface lg:grid-cols-4 lg:divide-x">
      {items.map((k) => (
        <div key={k.label} className="px-4 py-3">
          <dt className="text-[13px] text-ink-2">{k.label}</dt>
          <dd className="num mt-0.5 text-[22px] font-semibold leading-tight">{k.value}</dd>
          {k.hint && <p className="mt-0.5 text-[12px] text-ink-2">{k.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => {
            onChange(t.id);
          }}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-[14px] text-ink-2 hover:text-ink aria-selected:border-primary aria-selected:font-medium aria-selected:text-ink"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
