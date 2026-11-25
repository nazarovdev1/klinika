'use client';

import { loginRequestSchema } from '@shifo/contracts';
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Field, Input } from '@/components/ui/form';
import { Logo } from '@/components/ui/logo';
import { useRouter } from '@/i18n/navigation';
import { ApiError, login } from '@/lib/api';
import { useSession } from '@/lib/session';

/** One eight-point star tile (two overlapping squares), repeated on the navy half of the login screen. */
const GIRIH = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="#c9d3fb" stroke-width="1.2"><rect x="18" y="18" width="36" height="36"/><rect x="18" y="18" width="36" height="36" transform="rotate(45 36 36)"/><circle cx="36" cy="36" r="6"/></svg>',
)}")`;

export default function LoginPage() {
  const t = useTranslations('login');
  const router = useRouter();
  const { setUser } = useSession();
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
      const data = await login(parsed.data.login, parsed.data.password);
      setUser(data.user);
      router.push(data.user.mustChangePassword ? '/change-password' : '/');
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
    <main className="grid min-h-screen bg-surface max-lg:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-rail p-6 text-white lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{ backgroundImage: GIRIH, backgroundSize: '72px 72px' }}
        />
        <Logo onDark className="relative" />
        <p className="relative max-w-[14em] text-balance text-[26px] font-semibold leading-tight tracking-tight lg:text-[44px]">
          {t('tagline')}
        </p>
      </div>
      <div className="grid place-items-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-6 text-[28px] font-semibold tracking-tight">{t('title')}</h1>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <Field label={t('login')}>
              <Input name="login" autoComplete="username" autoFocus />
            </Field>
            <Field label={t('password')}>
              <Input name="password" type="password" autoComplete="current-password" />
            </Field>
            {error && <ErrorNote error={new Error(error)} />}
            <Button type="submit" size="lg" icon={LogIn} loading={busy} className="w-full">
              {t('submit')}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
