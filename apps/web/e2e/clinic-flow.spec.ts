import { expect, test, type Browser, type Page } from '@playwright/test';

const PASSWORD = 'E2e-pass-12345';
// Unique per run/attempt: a serial group retried after a flaky remote-DB stall must not hit duplicate detection.
const LAST =
  'Sinov' +
  Math.random()
    .toString(36)
    .replace(/[^a-z]/g, '')
    .slice(0, 6);

async function login(page: Page, who: string): Promise<void> {
  await page.goto('/uz/login');
  await page.getByLabel('Login').fill(`e2e.${who}`);
  await page.getByLabel('Parol').fill(PASSWORD);
  await page.getByRole('button', { name: 'Kirish' }).click();
  await expect(page.getByRole('navigation', { name: 'main' })).toBeVisible();
}
const newPage = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();

/** Local (Asia/Tashkent, UTC+5) weekday: the demo doctors do not work on Sundays. */
const isSundayInTashkent = new Date(Date.now() + 5 * 3_600_000).getUTCDay() === 0;
const section = (page: Page, heading: string) =>
  page
    .locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) })
    .last();

test.describe.configure({ mode: 'serial' });

test('protected pages redirect to login; wrong password is rejected', async ({ page }) => {
  await page.goto('/uz/patients');
  await expect(page).toHaveURL(/\/uz\/login/);
  await page.getByLabel('Login').fill('e2e.owner');
  await page.getByLabel('Parol').fill('wrong-password-1');
  await page.getByRole('button', { name: 'Kirish' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('registrar registers a patient, books today and marks arrival (queue ticket appears)', async ({
  browser,
}) => {
  test.skip(isSundayInTashkent, 'doctors do not work on Sundays');
  const page = await newPage(browser);
  await login(page, 'registrar');

  await page.getByRole('link', { name: 'Bemorlar' }).click();
  await page.getByRole('button', { name: 'Yangi bemor' }).click();
  await page.getByLabel('Familiya').fill(LAST);
  await page.getByLabel('Ism', { exact: true }).fill('Aziz');
  await page.getByLabel("Tug'ilgan sana").last().fill('1990-05-01');
  await page.getByLabel('Telefon').last().fill('+998901234567');
  await page.getByRole('button', { name: 'Yaratish' }).click();
  await page.getByPlaceholder(/Ism, telefon/).fill(LAST);
  await expect(page.getByRole('cell', { name: new RegExp(LAST) })).toBeVisible();

  await page.getByRole('link', { name: 'Kalendar' }).click();
  await page.getByRole('button', { name: 'Yangi qabul' }).click();
  await page.getByLabel('Bemor').fill(LAST);
  await page
    .getByRole('button', { name: new RegExp(LAST) })
    .first()
    .click();
  await page
    .getByRole('combobox', { name: 'Shifokor' })
    .last()
    .selectOption({ label: 'Dr. Terapevt 1 (Terapevt)' });
  await page
    .locator('button:not([disabled])')
    .filter({ hasText: /^\d{2}:\d{2}$/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Yozish', exact: true }).click();
  const block = page.getByRole('button', { name: new RegExp(`${LAST}.*—`) });
  await expect(block).toBeVisible();

  // arrival issues a queue ticket
  await block.click();
  await page.getByRole('button', { name: 'Keldi' }).click();
  await page.getByRole('link', { name: 'Navbat', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(LAST) })).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(LAST) }).getByText('Kutmoqda'),
  ).toBeVisible();
});

test('doctor opens the visit, adds an ICD-10 diagnosis, signs, and gets the PDF', async ({
  browser,
}) => {
  test.skip(isSundayInTashkent, 'doctors do not work on Sundays');
  const page = await newPage(browser);
  await login(page, 'doctor1');
  await page.getByRole('link', { name: 'Qabullar', exact: true }).click();
  await page.locator('li', { hasText: LAST }).getByRole('button', { name: 'Boshlash' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(LAST) })).toBeVisible({
    timeout: 45_000,
  });

  await section(page, 'Shikoyatlar').locator('textarea').fill('Bosh og‘rig‘i, harorat');
  await page.getByPlaceholder(/Kod yoki nom/).fill('J06');
  await page.getByRole('button', { name: /J06\.9/ }).click();
  await expect(page.getByText('J06.9').first()).toBeVisible();
  await page.getByRole('button', { name: 'Imzolash' }).click();
  await expect(page.getByRole('heading', { name: /Imzolangan:/ })).toBeVisible();

  // signed encounters are read-only
  await expect(section(page, 'Shikoyatlar').locator('textarea')).toBeDisabled();
  const pdf = page.waitForResponse((r) => r.url().includes('/pdf?lang=uz'));
  await page.getByRole('button', { name: 'PDF UZ' }).click();
  const res = await pdf;
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
});

test('cashier opens a shift, invoices the patient and takes a cash payment', async ({
  browser,
}) => {
  const page = await newPage(browser);
  await login(page, 'cashier');
  await page.getByRole('link', { name: /lovlar/ }).click();
  await page.getByRole('button', { name: 'Smenani ochish' }).click();
  await expect(page.getByRole('button', { name: 'Smenani yopish' })).toBeVisible();

  const card = section(page, 'Yangi hisob-faktura');
  await card.getByLabel('Bemor').fill(LAST);
  await card
    .getByRole('button', { name: new RegExp(LAST) })
    .first()
    .click();
  await card.getByRole('combobox', { name: 'Xizmat' }).selectOption({ index: 1 });
  await card.getByRole('button', { name: 'Qo‘shish' }).first().click();
  await card.getByRole('button', { name: 'Yaratish' }).click();

  await page.getByRole('button', { name: 'Hisob-faktura chiqarish' }).click();
  await expect(page.getByRole('button', { name: 'To‘lov qabul qilish' })).toBeVisible();
  await page.getByPlaceholder(/\d/).first().fill('50000');
  await page.getByRole('button', { name: 'To‘lov qabul qilish' }).click();
  await expect(page.getByRole('cell').getByText('To‘langan').first()).toBeVisible();
});

test('owner: language switch, reports and integration; cashier lacks reports', async ({
  browser,
}) => {
  const owner = await newPage(browser);
  await login(owner, 'owner');
  await owner.getByRole('link', { name: 'Hisobotlar' }).click();
  await expect(owner.getByRole('heading', { name: 'Hisobotlar' })).toBeVisible();
  await expect(owner.getByRole('columnheader').first()).toBeVisible();
  await owner.getByRole('link', { name: 'Integratsiya' }).click();
  await expect(owner.getByText('mock').first()).toBeVisible();
  await owner.getByRole('link', { name: 'RU', exact: true }).click();
  await expect(owner).toHaveURL(/\/ru\//);
  await expect(owner.getByRole('link', { name: 'Пациенты' })).toBeVisible();

  const cashier = await newPage(browser);
  await login(cashier, 'cashier');
  await expect(cashier.getByRole('link', { name: 'Hisobotlar' })).toHaveCount(0);
});
