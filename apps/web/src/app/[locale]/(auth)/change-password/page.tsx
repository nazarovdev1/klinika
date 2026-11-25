'use client';

import { changePasswordRequestSchema } from '@shifo/contracts';
import type { TokenResponse } from '@shifo/contracts';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Field, Input, Notice } from '@/components/ui/form';
import { Logo } from '@/components/ui/logo';
import { useRouter } from '@/i18n/navigation';
import { api, setAccessToken } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function ChangePasswordPage() {
  const t = useTranslations('changePassword');
  const router = useRouter();
  const { user, loading, setUser } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function onSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(', '));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<TokenResponse>('/auth/change-password', {
        method: 'POST',
        json: parsed.data,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      router.replace('/');
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-[400px] rounded-card border border-line bg-surface p-7">
        <Logo />
        <h1 className="mb-2 mt-6 text-[22px] font-semibold">{t('title')}</h1>
        <div className="mb-5">
          <Notice tone="info">{t('hint')}</Notice>
        </div>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <Field label={t('current')}>
            <Input name="currentPassword" type="password" autoComplete="current-password" />
          </Field>
          <Field label={t('next')}>
            <Input name="newPassword" type="password" autoComplete="new-password" />
          </Field>
          {error && <ErrorNote error={new Error(error)} />}
          <Button type="submit" icon={KeyRound} loading={busy} className="w-full">
            {t('submit')}
          </Button>
        </form>
      </div>
    </main>
  );
}
