'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { use, useEffect } from 'react';
import { io } from 'socket.io-client';
import { LogoMark } from '@/components/ui/logo';

interface ScreenView {
  branchName: string;
  tickets: { number: number; cabinet: string | null; text: string }[];
}

/** Public waiting-room display: live over Socket.IO (/screen namespace), with a polling fallback. */
export default function ScreenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations('screen');
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['screen', token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/screen/${token}`);
      if (!res.ok) throw new Error('screen');
      return (await res.json()) as ScreenView;
    },
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const origin = process.env.NEXT_PUBLIC_REALTIME_URL ?? window.location.origin;
    const socket = io(`${origin}/screen`, { auth: { token }, transports: ['websocket'] });
    const refresh = (): void => {
      void qc.invalidateQueries({ queryKey: ['screen', token] });
    };
    socket.on('queue.called', (e: { text: string }) => {
      refresh();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(e.text));
      }
    });
    socket.on('queue.updated', refresh);
    return () => {
      socket.close();
    };
  }, [token, qc]);

  const [current, ...rest] = data?.tickets ?? [];
  return (
    <main className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-10 py-5">
        <LogoMark size={28} />
        <h1 className="text-[28px] font-semibold">{data?.branchName ?? t('title')}</h1>
      </header>
      <div className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          className="flex flex-col items-center justify-center gap-4 p-10"
          aria-live="assertive"
        >
          {current ? (
            <>
              <p className="num text-[220px] font-semibold leading-none text-primary">
                {current.number}
              </p>
              {current.cabinet && (
                <p className="text-[56px] font-medium">
                  {t('cabinet')} <span className="num">{current.cabinet}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-[32px] text-ink-2">{t('empty')}</p>
          )}
        </section>
        <aside className="border-l border-line bg-surface p-10">
          <ul className="divide-y divide-line">
            {rest.slice(0, 6).map((x) => (
              <li key={x.number} className="flex items-baseline justify-between py-4">
                <span className="num text-[48px] font-semibold">{x.number}</span>
                {x.cabinet && <span className="num text-[32px] text-ink-2">{x.cabinet}</span>}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
