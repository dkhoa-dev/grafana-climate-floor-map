import { test, expect } from '@grafana/plugin-e2e';

test('paints rooms of the demo plan by status', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  const plan = page.getByTestId('climate-floor-plan');

  await expect(plan.locator('[data-cfm-room="Office A"]')).toHaveAttribute('data-status', 'ok');
  await expect(plan.locator('[data-cfm-room="Server room"]')).toHaveAttribute('data-status', 'alarm');
  await expect(plan.locator('[data-cfm-room="Storage"]')).toHaveAttribute('data-status', 'unbound');
  await expect(page.getByTestId('climate-floor-legend')).toBeVisible();
});

test('shows a tooltip when hovering a room', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });

  await page.getByTestId('climate-floor-plan').locator('[data-cfm-room="Lab 1"]').hover();
  await expect(page.getByTestId('climate-floor-tooltip')).toContainText('Lab 1');
});

test('binds a sensor to a room from the options pane', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  const storage = page.getByTestId('climate-floor-plan').locator('[data-cfm-room="Storage"]');
  await expect(storage).toHaveAttribute('data-status', 'unbound');

  const options = panelEditPage.getCustomOptions('Rooms');
  await options.element.getByPlaceholder('Auto: no match').first().click();
  await page.getByRole('option', { name: /n-08/ }).click();

  await expect(storage).not.toHaveAttribute('data-status', 'unbound');
});
