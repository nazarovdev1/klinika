import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // The waiting-room screen is public and locale-less; skip api, Next internals and static files.
  matcher: ['/((?!api|screen|_next|_vercel|.*\\..*).*)'],
};
