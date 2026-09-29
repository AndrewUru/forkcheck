import { test, expect } from '@playwright/test';
test('setup renders without errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Tu operación empiezacon una base segura.',
  );
  await expect(page.getByRole('heading', { name: '01 · Conecta la base de datos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `artifacts/setup-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('protected route does not leak data when unconfigured', async ({ page }) => {
  await page.goto('/equipment/private-code');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText('La aplicación está instalada.', { exact: false })).toBeVisible();
});
test('manifest and installable icons are available', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect((await request.get('/icon-192.png')).ok()).toBe(true);
});
