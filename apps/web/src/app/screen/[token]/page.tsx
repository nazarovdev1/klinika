'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { use, useEffect } from 'react';
import { io } from 'socket.io-client';

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-semibold">{data?.branchName ?? t('title')}</h1>
      {current ? (
        <div className="text-center" aria-live="assertive">
          <p className="text-[9rem] leading-none font-bold">{current.number}</p>
          {current.cabinet && (
            <p className="text-6xl">
              {t('cabinet')} {current.cabinet}
            </p>
          )}
        </div>
      ) : (
        <p className="text-3xl text-muted-foreground">{t('empty')}</p>
      )}
      <ul className="flex gap-6 text-4xl text-muted-foreground">
        {rest.slice(0, 5).map((x) => (
          <li key={x.number}>
            {x.number}
            {x.cabinet ? ` → ${x.cabinet}` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
