import { getRequestConfig } from 'next-intl/server';
import { hasLocale, type AbstractIntlMessages } from 'next-intl';
import { routing } from './routing';

// next/root-params (the replacement for requestLocale) is not available in Next 15.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: ((await import(`../../messages/${locale}.json`)) as { default: AbstractIntlMessages })
      .default,
    timeZone: 'Asia/Tashkent',
  };
});
