#!/usr/bin/env node
/**
 * Captures README screenshots from the running demo stack.
 *
 *   npm run server                     # in another terminal, wait for Grafana
 *   node scripts/screenshots.mjs [outDir]
 *
 * GRAFANA_URL defaults to http://localhost:3000; the demo stack allows anonymous admin access.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.GRAFANA_URL ?? 'http://localhost:3000';
const out = process.argv[2] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 820 }, deviceScaleFactor: 1 });

async function open(path, theme) {
  await page.goto(`${base}${path}${path.includes('?') ? '&' : '?'}kiosk&theme=${theme}`);
  await page.locator('[data-cfm-status]').first().waitFor();
  // Let the colour fade finish.
  await page.waitForTimeout(1200);
}

for (const theme of ['dark', 'light']) {
  await open('/d/cfm-live-floor/live-floor?viewPanel=panel-1', theme);
  await page.screenshot({ path: join(out, `live-floor-${theme}.png`) });
}

await open('/d/cfm-live-floor/live-floor?viewPanel=panel-1', 'dark');
const server = page.locator('[data-cfm-zone="Server room"]');
const box = await server.boundingBox();
await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8);
await page.getByTestId('cfm-tooltip').waitFor();
await page.screenshot({ path: join(out, 'tooltip.png') });

await open('/d/cfm-layouts/data-layouts', 'dark');
await page.screenshot({ path: join(out, 'layouts.png') });

await open('/d/cfm-edge-cases/edge-cases', 'dark');
await page.screenshot({ path: join(out, 'edge-cases.png') });

await browser.close();
console.log(`Screenshots written to ${out}/`);
