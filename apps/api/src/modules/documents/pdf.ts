import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

/** Renders HTML to PDF. Implemented with headless Chromium; swappable in tests. */
export interface PdfRenderer {
  render(html: string, opts?: { format?: 'A4'; widthMm?: number }): Promise<Buffer>;
  close(): Promise<void>;
}

export const canRenderPdf = (): boolean => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
};

export function createPlaywrightPdfRenderer(): PdfRenderer {
  let browser: Promise<Browser> | undefined;
  const getBrowser = (): Promise<Browser> => {
    browser ??= chromium.launch({ headless: true });
    return browser;
  };
  return {
    async render(html, opts) {
      const context = await (await getBrowser()).newContext();
      try {
        const page = await context.newPage();
        // No network: templates are self-contained (inline CSS, data: URI images).
        await page.route('**/*', (route) =>
          route.request().url().startsWith('data:') ? route.continue() : route.abort(),
        );
        await page.setContent(html, { waitUntil: 'load' });
        const pdf = await page.pdf({
          printBackground: true,
          ...(opts?.widthMm
            ? {
                width: `${opts.widthMm}mm`,
                margin: { top: '4mm', bottom: '4mm', left: '4mm', right: '4mm' },
              }
            : {
                format: 'A4',
                margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
              }),
        });
        return Buffer.from(pdf);
      } finally {
        await context.close();
      }
    },
    async close() {
      if (browser) await (await browser).close();
      browser = undefined;
    },
  };
}
