'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCheck,
  FilePenLine,
  FileText,
  PenLine,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status, Textarea } from '@/components/ui/form';
import { PageHeader, Workspace } from '@/components/ui/page';
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
  const apply = (dto: Encounter): void => {
    qc.setQueryData(['encounter', id], dto);
  };
  const saveAll = useMutation({
    mutationFn: async (): Promise<Encounter | undefined> => {
      if (!e) return undefined;
      await api(`/encounters/${id}`, { method: 'PATCH', json: { version: e.version, ...text } });
      await api(`/encounters/${id}/diagnoses`, {
        method: 'PUT',
        json: {
          items: dx.map((d) => ({ icd10Code: d.icd10Code, type: d.type, note: d.note ?? null })),
        },
      });
      // Each write answers with the full encounter: the last one carries the newest version.
      return api<Encounter>(`/encounters/${id}/prescriptions`, {
        method: 'PUT',
        json: { items: rx.filter((r) => r.drugName.trim()) },
      });
    },
    onSuccess: (dto) => {
      if (dto) apply(dto);
    },
  });
  const saveVitals = useMutation({
    mutationFn: () =>
      api<Encounter>(`/encounters/${id}/vitals`, {
        method: 'PUT',
        json: Object.fromEntries(VITAL_KEYS.map((k) => [k, num(vitals[k])])),
      }),
    onSuccess: apply,
  });
  const sign = useMutation({
    mutationFn: async () => {
      const saved = await saveAll.mutateAsync();
      return api<Encounter>(`/encounters/${id}/sign`, {
        method: 'POST',
        json: { version: saved?.version ?? e?.version },
      });
    },
    onSuccess: apply,
  });
  const addAddendum = useMutation({
    mutationFn: () =>
      api(`/encounters/${id}/addenda`, { method: 'POST', json: { text: addendum } }),
    onSuccess: async () => {
      setAddendum('');
      await refresh();
    },
  });

  if (enc.isLoading) return <p className="text-ink-2">{c('loading')}</p>;
  if (enc.error || !e) return <ErrorNote error={enc.error ?? new Error(c('loadError'))} />;

  const past = history.data?.items.filter((h) => h.id !== id) ?? [];
  const signed = e.status === 'SIGNED';

  return (
    <Workspace
      side={
        <>
          {canEdit && (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="lg"
                icon={Save}
                loading={saveAll.isPending}
                onClick={() => {
                  saveAll.mutate();
                }}
              >
                {c('save')}
              </Button>
              <Button
                size="lg"
                icon={PenLine}
                loading={sign.isPending}
                disabled={!dx.some((d) => d.type === 'PRIMARY')}
                onClick={() => {
                  sign.mutate();
                }}
              >
                {t('sign')}
              </Button>
            </div>
          )}
          <Card
            title={t('vitals')}
            actions={
              canVitals && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={Save}
                  loading={saveVitals.isPending}
                  onClick={() => {
                    saveVitals.mutate();
                  }}
                >
                  {t('saveVitals')}
                </Button>
              )
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {VITAL_KEYS.map((k) => (
                <Field key={k} label={t(`v.${k}`)}>
                  <Input
                    className="num"
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
          </Card>
          {past.length > 0 && (
            <Card title={t('history')} flush>
              <ul className="divide-y divide-line">
                {past.map((h) => (
                  <li key={h.id} className="px-4 py-2 text-[14px]">
                    <Link className="num" href={`/visits/${h.id}`}>
                      {fmtDateTime(h.signedAt)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      }
    >
      <PageHeader title={patient.data ? patientName(patient.data) : t('title')}>
        <Status tone={signed ? 'ok' : 'warn'} icon={signed ? CheckCheck : FilePenLine}>
          {t(`status.${e.status}`)}
        </Status>
      </PageHeader>
      {patient.data?.allergiesText && (
        <p className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[14px] text-danger-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <b className="font-semibold">{t('allergies')}:</b> {patient.data.allergiesText}
          </span>
        </p>
      )}
      <ErrorNote error={saveAll.error ?? saveVitals.error ?? sign.error ?? addAddendum.error} />

      {TEXT_FIELDS.map((f) => (
        <Card key={f} title={t(`f.${f}`)}>
          <Textarea
            aria-label={t(`f.${f}`)}
            className="!h-auto min-h-28 resize-y !py-2 text-[16px] leading-relaxed"
            disabled={!canEdit}
            value={text[f]}
            onChange={(ev) => {
              setText({ ...text, [f]: ev.target.value });
            }}
          />
          {canEdit && templates.data?.some((x) => x.field === f) && (
            <div className="flex flex-wrap gap-1.5">
              {templates.data
                .filter((x) => x.field === f)
                .map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-[13px] text-ink-2 hover:bg-row-hover hover:text-ink"
                    onClick={() => {
                      setText({ ...text, [f]: `${text[f]}${text[f] ? '\n' : ''}${x.body}` });
                    }}
                  >
                    <Plus size={13} aria-hidden />
                    {x.title}
                  </button>
                ))}
            </div>
          )}
        </Card>
      ))}

      <Card title={t('diagnoses')}>
        {dx.length > 0 && (
          <ul className="divide-y divide-line rounded-control border border-line">
            {dx.map((d, i) => (
              <li
                key={d.icd10Code + String(i)}
                className="flex flex-wrap items-center gap-3 px-3 py-2"
              >
                <span className="num w-14 font-semibold">{d.icd10Code}</span>
                <span className="min-w-0 flex-1 text-[15px]">{d.title}</span>
                <Select
                  aria-label={t('diagnoses')}
                  className="!w-44"
                  disabled={!canEdit}
                  value={d.type}
                  onChange={(ev) => {
                    setDx(
                      dx.map((x, j) =>
                        j === i ? { ...x, type: ev.target.value as Dx['type'] } : x,
                      ),
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
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => {
                      setDx(dx.filter((_, j) => j !== i));
                    }}
                  >
                    {c('delete')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
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
              <ul className="divide-y divide-line rounded-control border border-line bg-surface">
                {icd.data.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-[14px] hover:bg-row-hover"
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
                      <b className="num font-semibold">{r.code}</b> {r.titleUz}
                      <span className="text-ink-2"> · {r.titleRu}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card
        title={t('prescriptions')}
        actions={
          canEdit && (
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={() => {
                setRx([...rx, { drugName: '' }]);
              }}
            >
              {c('add')}
            </Button>
          )
        }
      >
        {rx.map((r, i) => (
          <div key={i} className="grid items-center gap-2 sm:grid-cols-[2fr_1fr_1fr_80px_auto]">
            <Input
              aria-label={t('rx.drug')}
              placeholder={t('rx.drug')}
              disabled={!canEdit}
              value={r.drugName}
              onChange={(ev) => {
                setRx(rx.map((x, j) => (j === i ? { ...x, drugName: ev.target.value } : x)));
              }}
            />
            <Input
              aria-label={t('rx.dosage')}
              placeholder={t('rx.dosage')}
              disabled={!canEdit}
              value={r.dosage ?? ''}
              onChange={(ev) => {
                setRx(rx.map((x, j) => (j === i ? { ...x, dosage: ev.target.value } : x)));
              }}
            />
            <Input
              aria-label={t('rx.frequency')}
              placeholder={t('rx.frequency')}
              disabled={!canEdit}
              value={r.frequency ?? ''}
              onChange={(ev) => {
                setRx(rx.map((x, j) => (j === i ? { ...x, frequency: ev.target.value } : x)));
              }}
            />
            <Input
              aria-label={t('rx.days')}
              className="num"
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
            {canEdit ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={() => {
                  setRx(rx.filter((_, j) => j !== i));
                }}
              >
                {c('delete')}
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {rx.length === 0 && <p className="text-[14px] text-ink-2">—</p>}
      </Card>

      {signed && (
        <Card title={t('signedAt', { date: fmtDateTime(e.signedAt) })}>
          <div className="flex gap-2">
            {(['uz', 'ru'] as const).map((l) => (
              <Button
                key={l}
                variant="outline"
                icon={FileText}
                onClick={() => {
                  void openBlob(`/encounters/${id}/pdf?lang=${l}`);
                }}
              >
                {c('pdf')} {l.toUpperCase()}
              </Button>
            ))}
          </div>
          {e.addenda.map((a) => (
            <div key={a.id} className="rounded-control border border-line bg-bg px-3 py-2">
              <p className="num text-[13px] text-ink-2">{fmtDateTime(a.createdAt)}</p>
              <p className="text-[15px]">{a.text}</p>
            </div>
          ))}
          {mine && can('encounters:write') && (
            <div className="space-y-2">
              <Textarea
                aria-label={t('addendum')}
                className="!h-auto min-h-20 !py-2"
                placeholder={t('addendum')}
                value={addendum}
                onChange={(ev) => {
                  setAddendum(ev.target.value);
                }}
              />
              <Button
                loading={addAddendum.isPending}
                disabled={!addendum.trim()}
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
    </Workspace>
  );
}
