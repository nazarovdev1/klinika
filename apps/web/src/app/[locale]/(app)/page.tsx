import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('home');
  return <h1 className="text-2xl font-semibold">{t('welcome')}</h1>;
}
