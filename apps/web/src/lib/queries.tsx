'use client';

import type { PatientDto } from '@shifo/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';

export interface DoctorRow {
  id: string;
  fullName: string;
  specialty: string | null;
  cabinet: string | null;
  color: string | null;
  defaultSlotMinutes: number;
  branchIds: string[];
}
export interface BranchRow {
  id: string;
  name: string;
  timezone: string;
  screenToken?: string;
}
export interface ServiceRow {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  isLab: boolean;
  price: { price: string } | null;
}

export const useDoctors = () =>
  useQuery({
    queryKey: ['doctors'],
    queryFn: async () => (await api<{ items: DoctorRow[] }>('/doctors')).items,
  });

export const useBranches = () =>
  useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const r = await api<{ items: BranchRow[] } | BranchRow[]>('/branches');
      return Array.isArray(r) ? r : r.items;
    },
  });

export const useServices = (branchId: string | undefined, q = '') =>
  useQuery({
    queryKey: ['services', branchId, q],
    enabled: Boolean(branchId),
    queryFn: async () =>
      (
        await api<{ items: ServiceRow[] }>(
          `/services?limit=200&branchId=${branchId ?? ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
        )
      ).items,
  });

export const patientName = (p: Pick<PatientDto, 'lastName' | 'firstName' | 'middleName'>): string =>
  [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');

/** Type-ahead patient selector used by booking, queue, billing and lab forms. */
export function PatientPicker({
  value,
  onChange,
}: {
  value: PatientDto | null;
  onChange: (p: PatientDto | null) => void;
}) {
  const t = useTranslations('common');
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['patient-picker', q],
    enabled: q.trim().length >= 2,
    queryFn: () =>
      api<{ items: PatientDto[] }>(`/patients?limit=8&q=${encodeURIComponent(q.trim())}`),
  });
  if (value) {
    return (
      <p className="flex items-center gap-3">
        <b>{patientName(value)}</b>
        <span className="text-muted-foreground">{value.phone}</span>
        <button
          type="button"
          className="underline"
          onClick={() => {
            onChange(null);
          }}
        >
          {t('edit')}
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
        }}
        placeholder={t('search')}
        aria-label={t('patient')}
      />
      {data && data.items.length > 0 && (
        <ul className="rounded-md border border-border">
          {data.items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onChange(p);
                  setQ('');
                }}
              >
                {patientName(p)} · {p.birthDate.split('-').reverse().join('.')} · {p.phone}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
