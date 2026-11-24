import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import '../globals.css';

// Public waiting-room display: no locale prefix, no auth, read-only.
export default function ScreenLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
