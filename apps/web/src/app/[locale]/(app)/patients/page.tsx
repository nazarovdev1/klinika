'use client';

import type { PatientDto } from '@shifo/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function PatientsPage() {
  const t = useTranslations('patients');
  const [q, setQ] = useState('');
  const { data, isFetching, error } = useQuery({
    queryKey: ['patients', q],
    queryFn: () =>
      api<{ items: PatientDto[]; nextCursor: string | null }>(
        `/patients?limit=25${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <label className="block max-w-xl">
        <span className="mb-1 block">{t('search')}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </label>
      {error && <p role="alert">{t('loadError')}</p>}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{t('name')}</th>
            <th>{t('birthDate')}</th>
            <th>{t('phone')}</th>
            <th>{t('pinfl')}</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="py-2">
                {p.lastName} {p.firstName} {p.middleName ?? ''}
              </td>
              <td>{p.birthDate.split('-').reverse().join('.')}</td>
              <td>{p.phone}</td>
              <td>{p.pinfl ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.items.length === 0 && !isFetching && <p>{t('empty')}</p>}
    </section>
  );
}
