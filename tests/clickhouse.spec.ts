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
    const plan = page.getByTestId('sensor-floor-plan');

    // Lab 1 carries its own 20-22 °C limits and the demo runs it above them.
    await expect(plan.locator('[data-sfm-room="Lab 1"]')).toHaveAttribute('data-status', 'alarm');
    await expect(plan.locator('[data-sfm-room="Office A"]')).toHaveAttribute('data-status', 'ok');
    await expect(plan.locator('[data-sfm-room="Server room"]')).toHaveAttribute('data-status', 'ok');
    // A metric the panel has no option for: CO₂ above the built-in 1000 ppm limit.
    await expect(plan.locator('[data-sfm-room="Meeting room"]')).toHaveAttribute('data-status', 'alarm');
    await plan.locator('[data-sfm-room="Meeting room"]').hover();
    await expect(page.getByTestId('sensor-floor-tooltip')).toContainText(
      /CO₂1[12]\d\d ppm \(out of limits\) · limits ≤ 1000 ppm/
    );
    // The Storage sensor stopped reporting 90 minutes ago.
    await expect(plan.locator('[data-sfm-room="Storage"]')).toHaveAttribute('data-status', 'offline');
  });

  test('time series format, where limits arrive as labels', async ({
    gotoPanelEditPage,
    readProvisionedDashboard,
    page,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: 'clickhouse.json' });
    await gotoPanelEditPage({ dashboard, id: '2' });
    const plan = page.getByTestId('sensor-floor-plan');

    await expect(plan.locator('[data-sfm-room="Lab 1"]')).toHaveAttribute('data-status', 'alarm');
    // Its humidity (24-26 %) is below the panel's default 30 % but inside the sensor's own 20-55 %.
    await expect(plan.locator('[data-sfm-room="Server room"]')).toHaveAttribute('data-status', 'ok');
  });
});
