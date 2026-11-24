'use client';

import { loginRequestSchema } from '@shifo/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { ApiError, login } from '@/lib/api';

export default function LoginPage() {
  const t = useTranslations('login');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = loginRequestSchema.safeParse({
      login: form.get('login'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setError(t('invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(parsed.data.login, parsed.data.password);
      router.push('/patients');
    } catch (err) {
      const code = err instanceof ApiError ? err.problem?.code : undefined;
      setError(
        code === 'ACCOUNT_LOCKED'
          ? t('locked')
          : code === 'RATE_LIMITED'
            ? t('rateLimited')
            : t('invalid'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block">
          <span className="mb-1 block">{t('login')}</span>
          <input
            name="login"
            autoComplete="username"
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block">{t('password')}</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {t('submit')}
        </Button>
      </form>
    </main>
  );
}
