import { useTranslations } from 'next-intl';

// Placeholder; realtime queue display arrives in Phase 3.
export default function ScreenPage() {
  const t = useTranslations('screen');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-5xl font-bold">{t('title')}</h1>
      <p className="text-3xl text-muted-foreground">{t('empty')}</p>
    </main>
  );
}
