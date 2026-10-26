import { test, expect } from '@grafana/plugin-e2e';

test('draws a new room in the floor plan editor and saves it to the panel', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });

  await page.getByTestId('floor-plan-open-editor').click();
  const editor = page.getByTestId('floor-plan-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('floor-plan-ai')).toBeVisible();

  await editor.getByRole('radio', { name: /Rectangle/ }).click();
  const canvas = editor.getByTestId('floor-plan-canvas');
  const box = (await canvas.boundingBox())!;
  // The demo canvas is 800 x 480; the bottom-right corner below Lab 2 is free after growing it.
  await editor.getByLabel('Height').fill('600');
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.88);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.95, { steps: 5 });
  await page.mouse.up();

  await editor.getByTestId('floor-plan-room-name').fill('Kitchen');
  await editor.getByTestId('floor-plan-save').click();
  await expect(editor).toBeHidden();

  await expect(page.getByTestId('sensor-floor-plan').locator('[data-sfm-room="Kitchen"]')).toHaveAttribute(
    'data-status',
    'unbound'
  );
});

test('generates a plan through the Grafana LLM app', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">' +
    '<rect data-room="Open office" x="0" y="0" width="400" height="400"/>' +
    '<rect data-room="Server room" x="400" y="0" width="200" height="200"/>' +
    '<rect data-room="Kitchen" x="400" y="200" width="200" height="200"/></svg>';
  const reply = '```svg\n' + svg + '\n```\nAssumed the kitchen is next to the server room.';

  let body: { model?: string; messages?: Array<{ role: string; content: string }> } | undefined;
  await page.route('**/api/plugins/grafana-llm-app/settings', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/plugins/grafana-llm-app/health', (route) =>
    route.fulfill({ json: { details: { llmProvider: { configured: true, ok: true } } } })
  );
  await page.route('**/api/plugins/grafana-llm-app/resources/llm/v1/chat/completions', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      json: { choices: [{ message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] },
    });
  });

  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  await page.getByTestId('floor-plan-open-editor').click();
  const ai = page.getByTestId('floor-plan-ai');
  await ai.getByPlaceholder(/Describe the floor/).fill('Open office with a server room and kitchen on the right');
  await ai.getByText('Start from the current plan').click();
  await ai.getByRole('button', { name: 'Generate' }).click();

  await expect(ai).toContainText('Assumed the kitchen');
  expect(body?.model).toBe('large');
  expect(body?.messages?.[1].content).toContain('Open office with a server room');
  expect(JSON.stringify(body)).not.toContain('current_plan');

  await page.getByTestId('floor-plan-save').click();
  const plan = page.getByTestId('sensor-floor-plan');
  await expect(plan.locator('[data-sfm-room="Server room"]')).toHaveAttribute('data-status', 'alarm');
  await expect(plan.locator('[data-sfm-room="Kitchen"]')).toHaveAttribute('data-status', 'unbound');
  await expect(plan.locator('[data-sfm-room="Lobby"]')).toHaveCount(0);
});

test('copies a prompt for any AI chat and applies the pasted reply', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  await page.getByTestId('floor-plan-open-editor').click();
  const ai = page.getByTestId('floor-plan-ai');

  // Without the Grafana LLM app, the assistant says so and still offers the copy and paste route.
  await expect(ai.getByTestId('floor-plan-ai-llm-status')).toContainText(
    'The Grafana LLM app plugin is not installed.'
  );
  await expect(ai.getByRole('button', { name: 'Generate' })).toHaveCount(0);

  await ai.getByPlaceholder(/Describe the floor/).fill('Two labs side by side');
  await ai.getByText('Start from the current plan').click();
  await ai.getByText('I will attach an image or PDF of the floor plan').click();
  await ai.getByTestId('floor-plan-ai-copy').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('data-room="Room name"');
  expect(prompt).toContain('The attached image or PDF is a floor plan.');
  expect(prompt).toContain('Two labs side by side');
  expect(prompt).not.toContain('<current_plan>');

  await ai
    .getByTestId('floor-plan-ai-reply')
    .fill(
      'Here it is.\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
        '<rect data-room="Lab 1" x="0" y="0" width="200" height="200"/>' +
        '<rect data-room="Lab 2" x="200" y="0" width="200" height="200"/></svg>\n```'
    );
  await ai.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('floor-plan-canvas').locator('[data-shape-id]')).toHaveCount(2);
  await expect(ai).toContainText('Here it is.');
});
