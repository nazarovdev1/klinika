'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { Link } from '@/i18n/navigation';
import { api, openBlob } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { patientName } from '@/lib/queries';
import { useSession } from '@/lib/session';

const TEXT_FIELDS = [
  'complaints',
  'anamnesis',
  'objectiveStatus',
  'conclusion',
  'recommendations',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type Dx = {
  icd10Code: string;
  title?: string;
  type: 'PRIMARY' | 'SECONDARY' | 'COMPLICATION';
  note?: string | null;
};
type Rx = {
  drugName: string;
  dosage?: string | null;
  frequency?: string | null;
  durationDays?: number | null;
};
interface Encounter extends Record<TextField, string | null> {
  id: string;
  patientId: string;
  doctorId: string;
  status: 'OPEN' | 'SIGNED' | 'CANCELLED';
  version: number;
  signedAt: string | null;
  vitals: Record<string, number | null> | null;
  diagnoses: Dx[];
  prescriptions: Rx[];
  addenda: { id: string; text: string; createdAt: string }[];
}
interface Template {
  id: string;
  title: string;
  field: string;
  body: string;
}
interface Icd {
  code: string;
  titleUz: string;
  titleRu: string;
}

const VITAL_KEYS = [
  'temperature',
  'systolic',
  'diastolic',
  'pulse',
  'spo2',
  'weightKg',
  'heightCm',
] as const;

export default function EncounterPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('encounter');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const { user, can } = useSession();

  const enc = useQuery({
    queryKey: ['encounter', id],
    queryFn: () => api<Encounter>(`/encounters/${id}`),
  });
  const patient = useQuery({
    queryKey: ['patient', enc.data?.patientId],
    enabled: Boolean(enc.data?.patientId),
    queryFn: () => api<PatientDto>(`/patients/${enc.data?.patientId ?? ''}`),
  });
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api<{ items: Template[] }>('/text-templates')).items,
  });
  const history = useQuery({
    queryKey: ['history', enc.data?.patientId],
    enabled: Boolean(enc.data?.patientId),
    queryFn: () =>
      api<{ items: { id: string; signedAt: string | null; status: string }[] }>(
        `/encounters?patientId=${enc.data?.patientId ?? ''}&status=SIGNED&limit=10`,
      ),
  });

  const [text, setText] = useState<Record<TextField, string>>({
    complaints: '',
    anamnesis: '',
    objectiveStatus: '',
    conclusion: '',
    recommendations: '',
  });
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [dx, setDx] = useState<Dx[]>([]);
  const [rx, setRx] = useState<Rx[]>([]);
  const [icdQ, setIcdQ] = useState('');
  const [addendum, setAddendum] = useState('');
  const [loadedVersion, setLoadedVersion] = useState(-1);

  const e = enc.data;
  useEffect(() => {
    if (!e || e.version === loadedVersion) return;
    setLoadedVersion(e.version);
    setText(
      Object.fromEntries(TEXT_FIELDS.map((f) => [f, e[f] ?? ''])) as Record<TextField, string>,
    );
    setDx(e.diagnoses);
    setRx(e.prescriptions);
    setVitals(
      Object.fromEntries(
        VITAL_KEYS.map((k) => [k, e.vitals?.[k] != null ? String(e.vitals[k]) : '']),
      ),
    );
  }, [e, loadedVersion]);

  const icd = useQuery({
    queryKey: ['icd', icdQ],
    enabled: icdQ.trim().length >= 2,
    queryFn: async () =>
      (await api<{ items: Icd[] }>(`/icd10?q=${encodeURIComponent(icdQ.trim())}&limit=8`)).items,
  });

  const open = e?.status === 'OPEN';
  const mine = e?.doctorId === user?.id;
  const canEdit = open && mine && can('encounters:write');
  const canVitals = open && can('vitals:write') && (mine || user?.role === 'NURSE');
  const refresh = () => qc.invalidateQueries({ queryKey: ['encounter', id] });

  const num = (v: string | undefined): number | null =>
    v && v.trim() !== '' ? Number(v.replace(',', '.')) : null;
  const saveAll = useMutation({
    mutationFn: async () => {
      if (!e) return;
      await api(`/encounters/${id}`, { method: 'PATCH', json: { version: e.version, ...text } });
      await api(`/encounters/${id}/diagnoses`, {
        method: 'PUT',
        json: {
          items: dx.map((d) => ({ icd10Code: d.icd10Code, type: d.type, note: d.note ?? null })),
        },
      });
      await api(`/encounters/${id}/prescriptions`, {
        method: 'PUT',
        json: { items: rx.filter((r) => r.drugName.trim()) },
      });
    },
    onSuccess: refresh,
  });
  const saveVitals = useMutation({
    mutationFn: () =>
      api(`/encounters/${id}/vitals`, {
        method: 'PUT',
        json: Object.fromEntries(VITAL_KEYS.map((k) => [k, num(vitals[k])])),
      }),
    onSuccess: refresh,
  });
  const sign = useMutation({
    mutationFn: async () => {
      await saveAll.mutateAsync();
      const fresh = await api<Encounter>(`/encounters/${id}`);
      await api(`/encounters/${id}/sign`, { method: 'POST', json: { version: fresh.version } });
    },
    onSuccess: refresh,
  });
  const addAddendum = useMutation({
    mutationFn: () =>
      api(`/encounters/${id}/addenda`, { method: 'POST', json: { text: addendum } }),
    onSuccess: async () => {
      setAddendum('');
      await refresh();
    },
  });

  if (enc.isLoading) return <p>{c('loading')}</p>;
  if (enc.error || !e) return <ErrorNote error={enc.error ?? new Error(c('loadError'))} />;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {patient.data ? patientName(patient.data) : t('title')}
        </h1>
        <Badge tone={e.status === 'SIGNED' ? 'green' : 'amber'}>{t(`status.${e.status}`)}</Badge>
        {patient.data?.allergiesText && (
          <Badge tone="red">
            {t('allergies')}: {patient.data.allergiesText}
          </Badge>
        )}
      </div>
      <ErrorNote error={saveAll.error ?? saveVitals.error ?? sign.error ?? addAddendum.error} />

      <Card title={t('vitals')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {VITAL_KEYS.map((k) => (
            <Field key={k} label={t(`v.${k}`)}>
              <Input
                inputMode="decimal"
                disabled={!canVitals}
                value={vitals[k] ?? ''}
                onChange={(ev) => {
                  setVitals({ ...vitals, [k]: ev.target.value });
                }}
              />
            </Field>
          ))}
        </div>
        {canVitals && (
          <Button
            type="button"
            variant="outline"
            disabled={saveVitals.isPending}
            onClick={() => {
              saveVitals.mutate();
            }}
          >
            {t('saveVitals')}
          </Button>
        )}
      </Card>

      {TEXT_FIELDS.map((f) => (
        <Card key={f} title={t(`f.${f}`)}>
          <textarea
            className="min-h-24 w-full rounded-md border border-border px-3 py-2"
            disabled={!canEdit}
            value={text[f]}
            onChange={(ev) => {
              setText({ ...text, [f]: ev.target.value });
            }}
          />
          {canEdit && templates.data?.some((x) => x.field === f) && (
            <div className="flex flex-wrap gap-2">
              {templates.data
                .filter((x) => x.field === f)
                .map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="rounded-full border border-border px-3 py-1 text-sm hover:bg-muted"
                    onClick={() => {
                      setText({ ...text, [f]: `${text[f]}${text[f] ? '\n' : ''}${x.body}` });
                    }}
                  >
                    + {x.title}
                  </button>
                ))}
            </div>
          )}
        </Card>
      ))}

      <Card title={t('diagnoses')}>
        {dx.map((d, i) => (
          <div key={d.icd10Code + String(i)} className="flex flex-wrap items-center gap-2">
            <b>{d.icd10Code}</b>
            <span className="flex-1">{d.title}</span>
            <Select
              className="w-44"
              disabled={!canEdit}
              value={d.type}
              onChange={(ev) => {
                setDx(
                  dx.map((x, j) => (j === i ? { ...x, type: ev.target.value as Dx['type'] } : x)),
                );
              }}
            >
              {(['PRIMARY', 'SECONDARY', 'COMPLICATION'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`dx.${k}`)}
                </option>
              ))}
            </Select>
            {canEdit && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setDx(dx.filter((_, j) => j !== i));
                }}
              >
                {c('delete')}
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="space-y-1">
            <Input
              placeholder={t('icdSearch')}
              value={icdQ}
              onChange={(ev) => {
                setIcdQ(ev.target.value);
              }}
            />
            {icd.data && icd.data.length > 0 && (
              <ul className="rounded-md border border-border">
                {icd.data.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        if (!dx.some((x) => x.icd10Code === r.code)) {
                          setDx([
                            ...dx,
                            {
                              icd10Code: r.code,
                              title: r.titleUz,
                              type: dx.some((x) => x.type === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
                            },
                          ]);
                        }
                        setIcdQ('');
                      }}
                    >
                      <b>{r.code}</b> {r.titleUz} · {r.titleRu}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card title={t('prescriptions')}>
        {rx.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-5">
            <Input
              placeholder={t('rx.drug')}
              disabled={!canEdit}
              value={r.drugName}
              onChange={(ev) => {
                setRx(rx.map((x, j) => (j === i ? { ...x, drugName: ev.target.value } : x)));
              }}
            />
            <Input
              placeholder={t('rx.dosage')}
              disabled={!canEdit}
              value={r.dosage ?? ''}
              onChange={(ev) => {
                setRx(rx.map((x, j) => (j === i ? { ...x, dosage: ev.target.value } : x)));
              }}
            />
            <Input
              placeholder={t('rx.frequency')}
              disabled={!canEdit}
              value={r.frequency ?? ''}
              onChange={(ev) => {
                setRx(rx.map((x, j) => (j === i ? { ...x, frequency: ev.target.value } : x)));
              }}
            />
            <Input
              placeholder={t('rx.days')}
              inputMode="numeric"
              disabled={!canEdit}
              value={r.durationDays ?? ''}
              onChange={(ev) => {
                setRx(
                  rx.map((x, j) =>
                    j === i
                      ? { ...x, durationDays: ev.target.value ? Number(ev.target.value) : null }
                      : x,
                  ),
                );
              }}
            />
            {canEdit && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setRx(rx.filter((_, j) => j !== i));
                }}
              >
                {c('delete')}
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRx([...rx, { drugName: '' }]);
            }}
          >
            {c('add')}
          </Button>
        )}
      </Card>

      {canEdit && (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={saveAll.isPending}
            onClick={() => {
              saveAll.mutate();
            }}
          >
            {c('save')}
          </Button>
          <Button
            type="button"
            disabled={sign.isPending || !dx.some((d) => d.type === 'PRIMARY')}
            onClick={() => {
              sign.mutate();
            }}
          >
            {t('sign')}
          </Button>
        </div>
      )}

      {e.status === 'SIGNED' && (
        <Card title={t('signedAt', { date: fmtDateTime(e.signedAt) })}>
          <div className="flex gap-3">
            {(['uz', 'ru'] as const).map((l) => (
              <Button
                key={l}
                type="button"
                variant="outline"
                onClick={() => {
                  void openBlob(`/encounters/${id}/pdf?lang=${l}`);
                }}
              >
                {c('pdf')} {l.toUpperCase()}
              </Button>
            ))}
          </div>
          {e.addenda.map((a) => (
            <p key={a.id} className="border-l-4 border-border pl-3">
              <span className="text-sm text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
              <br />
              {a.text}
            </p>
          ))}
          {mine && can('encounters:write') && (
            <div className="space-y-2">
              <textarea
                className="min-h-20 w-full rounded-md border border-border px-3 py-2"
                placeholder={t('addendum')}
                value={addendum}
                onChange={(ev) => {
                  setAddendum(ev.target.value);
                }}
              />
              <Button
                type="button"
                disabled={!addendum.trim() || addAddendum.isPending}
                onClick={() => {
                  addAddendum.mutate();
                }}
              >
                {t('addAddendum')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {(history.data?.items.filter((h) => h.id !== id).length ?? 0) > 0 && (
        <Card title={t('history')}>
          <ul>
            {history.data?.items
              .filter((h) => h.id !== id)
              .map((h) => (
                <li key={h.id}>
                  <Link className="underline" href={`/visits/${h.id}`}>
                    {fmtDateTime(h.signedAt)}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
