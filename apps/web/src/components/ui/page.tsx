'use client';

import { Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from '@/components/ui/form';
import { cn } from '@/lib/utils';

/**
 * The app's one page frame: what to pick (list, white), what it is (children, on the desk), what to do with it
 * (side, white). Each pane scrolls on its own; below lg they stack in that order.
 */
export function Workspace({
  list,
  side,
  children,
}: {
  list?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'grid min-h-screen lg:h-screen lg:min-h-0',
        list &&
          side &&
          'lg:grid-cols-[290px_minmax(0,1fr)_300px] xl:grid-cols-[340px_minmax(0,1fr)_360px]',
        list && !side && 'lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]',
        !list && side && 'lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]',
        'max-lg:auto-rows-min',
      )}
    >
      {list && (
        <div className="flex min-h-0 min-w-0 flex-col border-line bg-surface max-lg:border-b lg:border-r">
          {list}
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4 *:shrink-0 xl:p-6">
        {children}
      </div>
      {side && (
        <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-line bg-surface p-5 max-lg:border-t lg:border-l">
          {side}
        </aside>
      )}
    </section>
  );
}

/** Title row of a list pane, with its one action and the filters below. */
export function PaneHead({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 px-4 pb-3 pt-5">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight">{title}</h1>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Title row of a main pane. */
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
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 [&>*]:whitespace-nowrap">{children}</div>
      )}
    </div>
  );
}

export function PaneList({ children }: { children: ReactNode }) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto border-b border-line max-lg:max-h-[320px]">
      {children}
    </ul>
  );
}

/** One selectable record: name and figure on top, facts and status below. */
export function Row({
  selected,
  onSelect,
  title,
  end,
  sub,
  status,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  end?: ReactNode;
  sub?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-left hover:bg-row-hover aria-[current=true]:bg-primary-soft"
        onClick={onSelect}
      >
        <span className="font-medium">{title}</span>
        <span className="num text-right font-semibold">{end}</span>
        <span className="num truncate text-[12px] text-ink-2">{sub}</span>
        <span className="justify-self-end">{status}</span>
      </button>
    </li>
  );
}

export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          className="rounded-full px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-row-hover aria-pressed:bg-primary aria-pressed:font-medium aria-pressed:text-white"
          onClick={() => {
            onChange(o.id);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={17}
        aria-hidden
        className="pointer-events-none absolute left-3 top-[11px] text-ink-2"
      />
      <Input type="search" className="!pl-9" {...p} />
    </div>
  );
}

/** Creation forms open here so the workspace stays free for the record in hand. Mount it to open it. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-card bg-surface p-0 text-ink backdrop:bg-[#0a0d16]/50"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <section className="space-y-4 p-5">
        <header className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="×"
            className="grid h-9 w-9 place-items-center rounded-control hover:bg-row-hover"
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        {children}
      </section>
    </dialog>
  );
}

/** Label/value facts of a record. */
export function Facts({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-5 gap-y-2.5 text-[14px]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="num min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[14px] text-ink-2">
      <Icon size={20} aria-hidden />
      <p>{children}</p>
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
    <dl className="flex flex-wrap rounded-card border border-line bg-surface">
      {items.map((k) => (
        <div
          key={k.label}
          className="min-w-fit flex-1 basis-[130px] border-line px-5 py-4 [&:not(:first-child)]:border-l"
        >
          <dt className="text-[13px] text-ink-2">{k.label}</dt>
          <dd className="num mt-1 whitespace-nowrap text-[20px] 2xl:text-[24px] font-semibold leading-tight tracking-tight">
            {k.value}
          </dd>
          {k.hint && <p className="mt-0.5 text-[12px] text-ink-2">{k.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Vertical section switch used by list panes (reports, settings). */
export function PaneNav<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <ul className="space-y-0.5 px-2 pb-3">
      {items.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            aria-current={value === i.id}
            className="w-full rounded-control px-3 py-2.5 text-left hover:bg-row-hover aria-[current=true]:bg-primary-soft aria-[current=true]:font-medium aria-[current=true]:text-primary-hover"
            onClick={() => {
              onChange(i.id);
            }}
          >
            {i.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
