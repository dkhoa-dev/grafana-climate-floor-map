import { test, expect } from '@grafana/plugin-e2e';

// Uses the ClickHouse service and demo data from docker-compose.yaml (dev/clickhouse/init.sql).
test.describe('ClickHouse data source', () => {
  test('table format with the newest reading per sensor', async ({
    gotoPanelEditPage,
    readProvisionedDashboard,
    page,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: 'clickhouse.json' });
    await gotoPanelEditPage({ dashboard, id: '1' });
    const plan = page.getByTestId('climate-floor-plan');

    // Lab 1 carries its own 20-22 °C limits and the demo runs it above them.
    await expect(plan.locator('[data-cfm-room="Lab 1"]')).toHaveAttribute('data-status', 'alarm');
    await expect(plan.locator('[data-cfm-room="Office A"]')).toHaveAttribute('data-status', 'ok');
    // The Storage sensor stopped reporting 90 minutes ago.
    await expect(plan.locator('[data-cfm-room="Storage"]')).toHaveAttribute('data-status', 'offline');
  });

  test('time series format, where limits arrive as labels', async ({
    gotoPanelEditPage,
    readProvisionedDashboard,
    page,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: 'clickhouse.json' });
    await gotoPanelEditPage({ dashboard, id: '2' });
    const plan = page.getByTestId('climate-floor-plan');

    await expect(plan.locator('[data-cfm-room="Lab 1"]')).toHaveAttribute('data-status', 'alarm');
    // 26-27 °C would be near the panel's default 27 °C limit; the sensor's own 16-28 °C keeps it within.
    await expect(plan.locator('[data-cfm-room="Server room"]')).toHaveAttribute('data-status', 'ok');
  });
});
