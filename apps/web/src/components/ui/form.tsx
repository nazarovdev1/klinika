import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-2">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('field-control', className)} {...p} />;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('field-control', className)} {...p} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('field-control pr-8', className)} {...p}>
      {children}
    </select>
  );
}

/** Bordered white surface. `title` renders a quiet header row; `actions` sit at its right. */
export function Card({
  title,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding: for tables that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface', className)}>
      {(title ?? actions) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'space-y-3 p-4'}>{children}</div>
    </section>
  );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
const TONE: Record<Tone, { box: string; icon: LucideIcon }> = {
  ok: { box: 'bg-ok-soft text-ok-text', icon: CheckCircle2 },
  warn: { box: 'bg-warn-soft text-warn-text', icon: Clock },
  danger: { box: 'bg-danger-soft text-danger-text', icon: XCircle },
  info: { box: 'bg-info-soft text-info-text', icon: Info },
  neutral: { box: 'bg-row-hover text-ink-2', icon: Circle },
};

/** Status is never color alone: tone + icon + text. */
export function Status({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[12px] font-medium',
        t.box,
      )}
    >
      <Icon size={13} aria-hidden />
      {children}
    </span>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : 'Error';
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[14px] text-danger-text"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      {msg}
    </p>
  );
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <p className={cn('flex items-start gap-2 rounded-control px-3 py-2 text-[14px]', t.box)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
