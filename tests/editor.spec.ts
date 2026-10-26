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

test('generates a plan with the AI assistant', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">' +
    '<rect data-room="Open office" x="0" y="0" width="400" height="400"/>' +
    '<rect data-room="Server room" x="400" y="0" width="200" height="200"/>' +
    '<rect data-room="Kitchen" x="400" y="200" width="200" height="200"/></svg>';
  const reply = '```svg\n' + svg + '\n```\nAssumed the kitchen is next to the server room.';
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 200 } },
    { type: 'message_stop' },
  ];

  let request: { headers: Record<string, string>; body: Record<string, unknown> } | undefined;
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST',
        },
      });
    }
    request = { headers: await route.request().allHeaders(), body: route.request().postDataJSON() };
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    });
  });

  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  await page.getByTestId('floor-plan-open-editor').click();
  const ai = page.getByTestId('floor-plan-ai');
  await ai.getByPlaceholder('sk-ant-…').fill('sk-ant-test');
  await ai.getByRole('textbox').last().fill('Open office with a server room and kitchen on the right');
  await ai.getByText('Start from the current plan').click();
  await ai.getByRole('button', { name: 'Generate' }).click();

  await expect(ai).toContainText('Assumed the kitchen');
  expect(request?.headers['authorization']).toBe('Bearer sk-ant-test');
  expect(request?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(request?.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
  expect(request?.body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', stream: true });
  expect(JSON.stringify(request?.body)).not.toContain('current_plan');

  await page.getByTestId('floor-plan-save').click();
  const plan = page.getByTestId('sensor-floor-plan');
  await expect(plan.locator('[data-sfm-room="Server room"]')).toHaveAttribute('data-status', 'alarm');
  await expect(plan.locator('[data-sfm-room="Kitchen"]')).toHaveAttribute('data-status', 'unbound');
  await expect(plan.locator('[data-sfm-room="Lobby"]')).toHaveCount(0);
});

test('generates a plan through an OpenAI-compatible provider', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
    '<rect data-room="Lab 1" x="0" y="0" width="200" height="200"/>' +
    '<rect data-room="Lab 2" x="200" y="0" width="200" height="200"/></svg>';
  const chunks = ['```svg\n', svg, '\n```'].map(
    (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
  );
  let body: Record<string, unknown> | undefined;
  let auth: string | undefined;
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      });
    }
    body = route.request().postDataJSON();
    auth = (await route.request().allHeaders())['authorization'];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: chunks.join('') + 'data: [DONE]\n\n',
    });
  });

  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  await page.getByTestId('floor-plan-open-editor').click();
  const ai = page.getByTestId('floor-plan-ai');
  const settings = ai.getByTestId('floor-plan-ai-settings');
  await settings.getByRole('radio', { name: 'OpenAI-compatible' }).click();
  await settings.getByRole('radio', { name: 'OpenRouter' }).click();
  await settings.getByLabel(/API key/).fill('or-test');
  await settings.getByPlaceholder('Model id').fill('some/vision-model');
  await ai.getByPlaceholder(/Describe the floor/).fill('Two labs side by side');
  await ai.getByText('Start from the current plan').click();
  await ai.getByRole('button', { name: 'Generate' }).click();

  await expect(page.getByTestId('floor-plan-canvas').locator('[data-shape-id]')).toHaveCount(2);
  expect(auth).toBe('Bearer or-test');
  expect(body).toMatchObject({ model: 'some/vision-model', stream: true });
});
