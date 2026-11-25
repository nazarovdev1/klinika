import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control = 'w-full rounded-md border border-border bg-background px-3 py-2';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...p} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, className)} {...p}>
      {children}
    </select>
  );
}

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3 rounded-lg border border-border p-4', className)}>
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-800">
      {msg}
    </p>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    gray: 'bg-muted text-foreground',
    green: 'bg-green-100 text-green-900',
    red: 'bg-red-100 text-red-900',
    amber: 'bg-amber-100 text-amber-900',
    blue: 'bg-blue-100 text-blue-900',
  };
  return <span className={cn('rounded-full px-2 py-0.5 text-sm', tones[tone])}>{children}</span>;
}
