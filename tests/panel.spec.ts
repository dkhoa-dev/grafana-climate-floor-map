import { test, expect } from '@grafana/plugin-e2e';

test('paints rooms of the demo plan by status', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  const plan = page.getByTestId('sensor-floor-plan');

  await expect(plan.locator('[data-sfm-room="Office A"]')).toHaveAttribute('data-status', 'ok');
  await expect(plan.locator('[data-sfm-room="Server room"]')).toHaveAttribute('data-status', 'alarm');
  await expect(plan.locator('[data-sfm-room="Storage"]')).toHaveAttribute('data-status', 'unbound');
  await expect(page.getByTestId('sensor-floor-legend')).toBeVisible();
});

test('shows a tooltip when hovering a room', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });

  await page.getByTestId('sensor-floor-plan').locator('[data-sfm-room="Lab 1"]').hover();
  await expect(page.getByTestId('sensor-floor-tooltip')).toContainText('Lab 1');
});

test('binds a sensor to a room from the options pane', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  const storage = page.getByTestId('sensor-floor-plan').locator('[data-sfm-room="Storage"]');
  await expect(storage).toHaveAttribute('data-status', 'unbound');

  const options = panelEditPage.getCustomOptions('Rooms');
  await options.element.getByPlaceholder('Auto: no match').first().click();
  await page.getByRole('option', { name: /n-08/ }).click();

  await expect(storage).not.toHaveAttribute('data-status', 'unbound');
});

test('a pasted plan cannot make the browser load anything from outside', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) {
      external.push(request.url());
    }
  });
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  const options = panelEditPage.getCustomOptions('Plan drawing');
  await options.expand();
  await options.element.getByText('SVG source', { exact: true }).click();
  // Chromium fetches both background layers on the root <svg> unless the sanitiser drops the style.
  await options.element
    .getByRole('textbox')
    .fill(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" style="background-image:image-set('https://example.invalid/a.png' 1x), \\75 rl(https://example.invalid/b.png)"><rect data-room="Probe" width="200" height="100" fill="#ccc"/></svg>`
    );
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('sensor-floor-plan').locator('[data-sfm-room="Probe"]')).toBeVisible();
  // Image requests start on first paint; give them time to show up.
  await page.waitForTimeout(2000);
  expect(external).toEqual([]);
});
