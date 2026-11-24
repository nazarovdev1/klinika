import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// Placeholder shell; wired to POST /auth/login in Phase 1.
export default function LoginPage() {
  const t = useTranslations('login');
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <form className="space-y-4">
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
        <Button type="submit" className="w-full">
          {t('submit')}
        </Button>
      </form>
    </main>
  );
}
