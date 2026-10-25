import { expect, test } from '@grafana/plugin-e2e';

test.describe('Live floor demo', () => {
  test('colours bound zones and marks the silent sensor offline', async ({ gotoDashboardPage, page }) => {
    await gotoDashboardPage({ uid: 'cfm-live-floor' });
    const lobby = page.locator('[data-cfm-zone="Lobby"]');
    await expect(lobby).toHaveAttribute('data-cfm-status', 'live');
    await expect(lobby).toHaveCSS('fill', /rgb/);
    const fill = await lobby.evaluate((el) => (el as SVGElement).style.fill);
    expect(fill).not.toBe('');
    await expect(page.locator('[data-cfm-zone="Print room"]')).toHaveAttribute('data-cfm-status', 'offline');
    await expect(page.locator('[data-cfm-readout="Print room"]')).toHaveText('offline');
    await expect(page.locator('[data-cfm-readout="Lobby"]')).toContainText('°C');
    await expect(page.getByTestId('cfm-legend')).toBeVisible();
  });

  test('shows a tooltip on hover and opens the zone detail on click', async ({ gotoDashboardPage, page }) => {
    await gotoDashboardPage({ uid: 'cfm-live-floor' });
    const lab = page.locator('[data-cfm-zone="Lab 1"]');
    // The readout text sits over the middle of the room; the panel maps it to the same zone.
    await lab.hover({ force: true });
    const tooltip = page.getByTestId('cfm-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Sensor sensor-09');
    await expect(tooltip).toContainText('/ 100');
    await lab.click({ force: true });
    await expect(page).toHaveURL(/\/d\/cfm-zone-detail\/.*var-zone=Lab(%20|\+)1.*var-sensor=sensor-09/);
    // The detail dashboard keeps only the clicked sensor's series.
    await expect(page.getByText('sensor="sensor-09"').first()).toBeVisible();
    await expect(page.getByText('sensor="sensor-01"')).toHaveCount(0);
  });
});

test('edge cases dashboard shows one zone per state', async ({ gotoDashboardPage, page }) => {
  await gotoDashboardPage({ uid: 'cfm-edge-cases' });
  const status = (zone: string) => page.locator(`[data-cfm-zone="${zone}"]`);
  await expect(status('Normal')).toHaveAttribute('data-cfm-status', 'live');
  await expect(status('Offline sensor')).toHaveAttribute('data-cfm-status', 'offline');
  await expect(status('Stale reading')).toHaveAttribute('data-cfm-status', 'stale');
  await expect(status('Not bound')).toHaveAttribute('data-cfm-status', 'unbound');
  await expect(page.locator('[data-cfm-readout="Humidity only"]')).toContainText('–');
  await status('Index above 100').hover({ force: true });
  await expect(page.getByTestId('cfm-tooltip')).toContainText('clamped');
  await status('Invalid limits').hover({ force: true });
  await expect(page.getByTestId('cfm-tooltip')).toContainText('data limits invalid');
});
