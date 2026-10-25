#!/usr/bin/env node
/**
 * Generates the demo floor plans and dashboards in provisioning/.
 *
 *   node scripts/generate-demo.mjs          write the files
 *   node scripts/generate-demo.mjs --check  fail if the committed files differ from a fresh run
 *
 * Everything here is synthetic: a fictional building, made-up sensor keys and values from a
 * seeded random generator, so every run produces the same files and the same screenshots.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_DIR = join(ROOT, 'demo', 'plans');
const DASHBOARD_DIR = join(ROOT, 'provisioning', 'dashboards');
const DATASOURCE = { type: 'grafana-testdata-datasource', uid: 'cfm-testdata' };
const PANEL_TYPE = 'dkhoadev-climatefloormap-panel';
const SEED = 20261025;

/** Small, fast, seedable PRNG (mulberry32). */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value, digits = 1) => Number(value.toFixed(digits));
const escapeXml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------
// Floor plans, written the way Inkscape saves them (namespaces, layers, labels, tspans).
// ---------------------------------------------------------------------------------------------

function svgDocument({ width, height, title, body }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   xmlns="http://www.w3.org/2000/svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   width="${width}"
   height="${height}"
   viewBox="0 0 ${width} ${height}"
   version="1.1"
   id="floor">
  <title id="floor-title">${escapeXml(title)}</title>
  <sodipodi:namedview id="namedview" pagecolor="#ffffff" bordercolor="#666666" inkscape:document-units="px" />
${body}
</svg>
`;
}

function room(id, zone, x, y, w, h, { fontSize = 16 } = {}) {
  const cx = round(x + w / 2);
  const cy = round(y + h / 2 + fontSize * 0.2);
  return `    <rect
       id="${id}-area"
       inkscape:label="${escapeXml(zone)} [zone]"
       x="${x}" y="${y}" width="${w}" height="${h}"
       style="fill:#eef1f4;stroke:#3c4650;stroke-width:3" />
    <text
       id="${id}-name"
       inkscape:label="${escapeXml(zone)} [zone title]"
       x="${x + 10}" y="${y + fontSize + 8}"
       style="font-size:${fontSize}px;font-weight:600;fill:#2b3138"><tspan sodipodi:role="line" id="${id}-name-line" x="${x + 10}" y="${y + fontSize + 8}">${escapeXml(zone)}</tspan></text>
    <text
       id="${id}-values"
       inkscape:label="${escapeXml(zone)} [zone readout]"
       x="${cx}" y="${cy}"
       style="font-size:${round(fontSize * 0.9)}px;text-anchor:middle;fill:#2b3138"><tspan sodipodi:role="line" id="${id}-values-line" x="${cx}" y="${cy}">–</tspan></text>`;
}

function door(x, y, horizontal, size = 34) {
  // A door leaf with its swing arc, purely decorative.
  return horizontal
    ? `    <path style="fill:none;stroke:#7a8590;stroke-width:1.5" d="M ${x} ${y} l ${size} 0 M ${x} ${y} a ${size} ${size} 0 0 1 ${size} ${-size}" />`
    : `    <path style="fill:none;stroke:#7a8590;stroke-width:1.5" d="M ${x} ${y} l 0 ${size} M ${x} ${y} a ${size} ${size} 0 0 0 ${size} ${size}" />`;
}

/** Office floor: 12 rooms around a corridor. Returns the markup and the zones in order. */
function officePlan() {
  const top = [
    ['lobby', 'Lobby', 20, 140],
    ['reception', 'Reception', 160, 120],
    ['meeting-a', 'Meeting A', 280, 120],
    ['meeting-b', 'Meeting B', 400, 120],
    ['quiet', 'Quiet room', 520, 100],
    ['server', 'Server room', 620, 160],
  ];
  const bottom = [
    ['open-office', 'Open office', 20, 280],
    ['kitchen', 'Kitchen', 300, 100],
    ['lab-1', 'Lab 1', 400, 120],
    ['lab-2', 'Lab 2', 520, 120],
  ];
  const rooms = [
    ...top.map(([id, zone, x, w]) => room(id, zone, x, 20, w, 200)),
    ...bottom.map(([id, zone, x, w]) => room(id, zone, x, 280, w, 220)),
    room('cold-store', 'Cold store', 640, 280, 140, 110),
    room('print', 'Print room', 640, 390, 140, 110),
  ];
  const doors = [
    ...top.map(([, , x, w]) => door(x + w / 2 - 17, 220, true)),
    ...bottom.map(([, , x, w]) => door(x + w / 2 - 17, 280, true)),
    door(640, 300, false),
    door(640, 410, false),
  ];
  const body = `  <g inkscape:groupmode="layer" id="layer-structure" inkscape:label="Structure">
    <rect id="outline" x="20" y="20" width="760" height="480" style="fill:#f7f8f9;stroke:#3c4650;stroke-width:6" />
    <rect id="corridor" x="20" y="220" width="760" height="60" style="fill:#fbfbfb;stroke:none" />
    <text id="corridor-label" x="400" y="256" style="font-size:13px;text-anchor:middle;fill:#8a949e;letter-spacing:4px"><tspan sodipodi:role="line" id="corridor-label-line" x="400" y="256">CORRIDOR</tspan></text>
  </g>
  <g inkscape:groupmode="layer" id="layer-rooms" inkscape:label="Rooms">
${rooms.join('\n')}
  </g>
  <g inkscape:groupmode="layer" id="layer-doors" inkscape:label="Doors">
${doors.join('\n')}
  </g>`;
  const zones = [...top.map((r) => r[1]), ...bottom.map((r) => r[1]), 'Cold store', 'Print room'];
  return { svg: svgDocument({ width: 800, height: 520, title: 'Demo office floor', body }), zones };
}

/** A larger floor: 36 bays in six wings, to show scale. */
function largePlan() {
  const wings = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rooms = [];
  const zones = [];
  wings.forEach((wing, col) => {
    for (let row = 0; row < 6; row++) {
      const zone = `Bay ${wing}${row + 1}`;
      const x = 20 + col * 195 + (col >= 3 ? 30 : 0);
      const y = 20 + row * 140 + (row >= 3 ? 40 : 0);
      rooms.push(room(`bay-${wing.toLowerCase()}${row + 1}`, zone, x, y, 185, 130, { fontSize: 14 }));
      zones.push(zone);
    }
  });
  const body = `  <g inkscape:groupmode="layer" id="layer-structure" inkscape:label="Structure">
    <rect id="outline" x="10" y="10" width="1210" height="900" style="fill:#f7f8f9;stroke:#3c4650;stroke-width:6" />
  </g>
  <g inkscape:groupmode="layer" id="layer-rooms" inkscape:label="Rooms">
${rooms.join('\n')}
  </g>`;
  return { svg: svgDocument({ width: 1230, height: 920, title: 'Demo large floor', body }), zones };
}

// ---------------------------------------------------------------------------------------------
// Sensor behaviour. One cycle of POINTS samples, TIME_STEP seconds apart, stands in for a day.
// ---------------------------------------------------------------------------------------------

const POINTS = 120;
const TIME_STEP = 30;

/** A believable series: slow cycle, small noise, optional excursion over part of the cycle. */
function series(random, { base, amplitude, noise, phase = 0, excursion }) {
  return Array.from({ length: POINTS }, (_, i) => {
    let value = base + amplitude * Math.sin((2 * Math.PI * i) / POINTS + phase) + (random() - 0.5) * 2 * noise;
    if (excursion && i >= excursion.from && i < excursion.to) {
      const t = (i - excursion.from) / (excursion.to - excursion.from);
      value += excursion.by * Math.sin(Math.PI * t);
    }
    return round(value);
  });
}

/** Room profiles for the office demo. Labels match zone names so auto-binding works. */
const OFFICE_SENSORS = [
  { key: 'sensor-01', zone: 'Lobby', t: [21.5, 1.2], h: [42, 4] },
  { key: 'sensor-02', zone: 'Reception', t: [22.5, 0.8], h: [40, 3] },
  { key: 'sensor-03', zone: 'Meeting A', t: [23.5, 1.5], h: [48, 5] },
  { key: 'sensor-04', zone: 'Meeting B', t: [22, 1], h: [45, 4] },
  { key: 'sensor-05', zone: 'Quiet room', t: [21, 0.6], h: [38, 2] },
  // Drifts above its band for part of each cycle.
  { key: 'sensor-06', zone: 'Server room', t: [24, 0.8], h: [35, 2], excursion: { from: 70, to: 100, by: 4.5 } },
  { key: 'sensor-07', zone: 'Open office', t: [22.8, 1.3], h: [44, 5] },
  { key: 'sensor-08', zone: 'Kitchen', t: [23, 2], h: [55, 6] },
  { key: 'sensor-09', zone: 'Lab 1', t: [21.8, 0.5], h: [46, 3] },
  { key: 'sensor-10', zone: 'Lab 2', t: [20.6, 0.7], h: [33, 3] },
  // Carries its own band in the data, unlike the others.
  {
    key: 'sensor-11',
    zone: 'Cold store',
    t: [10.5, 1.2],
    h: [55, 4],
    limits: { temperature: [8, 14], humidity: [40, 70] },
  },
  // Bound to "Print room" but never reports: the demo's offline sensor.
  { key: 'sensor-12', zone: 'Print room', silent: true },
];

function officeWaves(random) {
  const waves = [];
  OFFICE_SENSORS.forEach((sensor, i) => {
    if (sensor.silent) {
      return;
    }
    const labels = (metric) => `sensor=${sensor.key}, location=${sensor.zone}, metric=${metric}`;
    const phase = i * 0.4;
    const temperature = series(random, {
      base: sensor.t[0],
      amplitude: sensor.t[1],
      noise: 0.15,
      phase,
      excursion: sensor.excursion,
    });
    const humidity = series(random, { base: sensor.h[0], amplitude: sensor.h[1], noise: 0.6, phase: phase + 1 });
    waves.push(
      {
        timeStep: TIME_STEP,
        valuesCSV: temperature.join(','),
        labels: labels('temperature'),
        name: `${sensor.key} temperature`,
      },
      { timeStep: TIME_STEP, valuesCSV: humidity.join(','), labels: labels('humidity'), name: `${sensor.key} humidity` }
    );
    if (sensor.limits) {
      for (const [metric, [low, high]] of Object.entries(sensor.limits)) {
        waves.push(
          {
            timeStep: TIME_STEP,
            valuesCSV: `${low},${low}`,
            labels: labels(`${metric}_low`),
            name: `${sensor.key} ${metric} low`,
          },
          {
            timeStep: TIME_STEP,
            valuesCSV: `${high},${high}`,
            labels: labels(`${metric}_high`),
            name: `${sensor.key} ${metric} high`,
          }
        );
      }
    }
  });
  return waves;
}

/** One row per sensor at a single moment of the cycle, for the static CSV dashboards. */
function officeSnapshot(random, at) {
  return OFFICE_SENSORS.filter((s) => !s.silent).map((sensor, i) => {
    const phase = i * 0.4;
    const pick = (values) => values[at];
    return {
      sensor: sensor.key,
      label: sensor.zone,
      temperature: pick(
        series(random, { base: sensor.t[0], amplitude: sensor.t[1], noise: 0.15, phase, excursion: sensor.excursion })
      ),
      humidity: pick(series(random, { base: sensor.h[0], amplitude: sensor.h[1], noise: 0.6, phase: phase + 1 })),
      limits: sensor.limits,
    };
  });
}

function toCsv(header, rows) {
  return [header.join(','), ...rows.map((row) => header.map((h) => row[h] ?? '').join(','))].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------------------------

const DEFAULT_PANEL_OPTIONS = {
  labelAttribute: 'inkscape:label',
  zoneTag: 'zone',
  fields: {},
  limits: { temperature: { low: 20, high: 26 }, humidity: { low: 30, high: 60 } },
  staleAfterMinutes: 0,
  colorMode: 'continuous',
  indexMode: 'position',
  decimals: 1,
  fillOpacity: 0.8,
  animate: true,
  showLegend: true,
  legendText: [],
  linkTemplate: '',
  linkNewTab: true,
  bindings: {},
};

const DETAIL_LINK =
  '/d/cfm-zone-detail/zone-detail?var-zone=${__zone.name}&var-sensor=${__zone.sensor}&${__url_time_range}';

function floorPanel({ id, title, gridPos, plan, bindings, targets, options = {}, fieldConfig }) {
  return {
    id,
    type: PANEL_TYPE,
    title,
    gridPos,
    datasource: DATASOURCE,
    targets,
    options: { ...DEFAULT_PANEL_OPTIONS, planMarkup: plan, bindings, ...options },
    fieldConfig: fieldConfig ?? {
      defaults: {
        color: { mode: 'continuous-BlYlRd' },
        thresholds: thresholds([['blue'], ['green', 10], ['red', 90]]),
      },
      overrides: [],
    },
  };
}

function thresholds(steps) {
  return {
    mode: 'absolute',
    steps: steps.map(([color, value]) => ({ color, value: value === undefined ? null : value })),
  };
}

function dashboard({ uid, title, panels, refresh = '', time = { from: 'now-1h', to: 'now' }, templating = [] }) {
  return {
    uid,
    title,
    tags: ['climate-floor-map', 'demo'],
    editable: true,
    schemaVersion: 41,
    refresh,
    time,
    timezone: 'browser',
    templating: { list: templating },
    panels,
  };
}

const bindAll = (sensors) => Object.fromEntries(sensors.map((s) => [s.zone, s.key]));

function liveFloor(plan, waves) {
  return dashboard({
    uid: 'cfm-live-floor',
    title: 'Climate Floor Map: Live floor',
    refresh: '10s',
    panels: [
      floorPanel({
        id: 1,
        title: 'Office floor, live',
        gridPos: { x: 0, y: 0, w: 24, h: 18 },
        plan,
        bindings: bindAll(OFFICE_SENSORS),
        targets: [{ refId: 'A', datasource: DATASOURCE, scenarioId: 'predictable_csv_wave', csvWave: waves }],
        options: { linkTemplate: DETAIL_LINK, linkNewTab: false },
      }),
    ],
  });
}

function zoneDetail(waves) {
  return dashboard({
    uid: 'cfm-zone-detail',
    title: 'Climate Floor Map: Zone detail',
    refresh: '10s',
    templating: [
      { type: 'textbox', name: 'zone', label: 'Zone', query: 'Lobby', current: { text: 'Lobby', value: 'Lobby' } },
      {
        type: 'textbox',
        name: 'sensor',
        label: 'Sensor',
        query: 'sensor-01',
        current: { text: 'sensor-01', value: 'sensor-01' },
      },
    ],
    panels: ['temperature', 'humidity'].map((metric, i) => ({
      id: i + 1,
      type: 'timeseries',
      title: `$zone: ${metric}`,
      gridPos: { x: i * 12, y: 0, w: 12, h: 12 },
      datasource: DATASOURCE,
      targets: [
        {
          refId: 'A',
          datasource: DATASOURCE,
          scenarioId: 'predictable_csv_wave',
          csvWave: waves.filter((w) => w.labels.endsWith(`metric=${metric}`)),
        },
      ],
      transformations: [
        // Keeps the series of the sensor passed in the link; Grafana fills in $sensor.
        { id: 'filterFieldsByName', options: { include: { pattern: '^(Time|.*\\b${sensor}\\b.*)$' } } },
      ],
      fieldConfig: {
        defaults: { unit: metric === 'temperature' ? 'celsius' : 'percent', custom: { lineWidth: 2 } },
        overrides: [],
      },
      options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single' } },
    })),
  });
}

function layouts(plan, waves, snapshot) {
  const wide = toCsv(
    ['sensor', 'label', 'temperature', 'humidity', 'temperature_low', 'temperature_high'],
    snapshot.map((r) => ({
      ...r,
      temperature_low: r.limits?.temperature[0],
      temperature_high: r.limits?.temperature[1],
    }))
  );
  const precomputed = toCsv(
    ['sensor', 'status_index'],
    snapshot.map((r, i) => ({ sensor: r.sensor, status_index: [12, 35, 48, 55, 62, 96, 41, 70, 50, 22, 58][i] ?? 50 }))
  );
  const bands = thresholds([['green'], ['yellow', 25], ['orange', 50], ['red', 75]]);
  const deviationBands = thresholds([['green'], ['orange', 1], ['red', 50]]);
  const half = (x, y) => ({ x, y, w: 12, h: 13 });
  return dashboard({
    uid: 'cfm-layouts',
    title: 'Climate Floor Map: Data layouts',
    panels: [
      floorPanel({
        id: 1,
        title: 'Wide layout (CSV, one row per reading), continuous',
        gridPos: half(0, 0),
        plan,
        bindings: bindAll(OFFICE_SENSORS),
        targets: [{ refId: 'A', datasource: DATASOURCE, scenarioId: 'csv_content', csvContent: wide }],
      }),
      floorPanel({
        id: 2,
        title: 'Long layout (one series per sensor and metric), deviation index, bands',
        gridPos: half(12, 0),
        plan,
        bindings: bindAll(OFFICE_SENSORS),
        targets: [{ refId: 'A', datasource: DATASOURCE, scenarioId: 'predictable_csv_wave', csvWave: waves }],
        options: { colorMode: 'banded', indexMode: 'deviation' },
        fieldConfig: { defaults: { color: { mode: 'thresholds' }, thresholds: deviationBands }, overrides: [] },
      }),
      floorPanel({
        id: 3,
        title: 'Ready-made status index, bands',
        gridPos: half(0, 13),
        plan,
        bindings: bindAll(OFFICE_SENSORS),
        targets: [{ refId: 'A', datasource: DATASOURCE, scenarioId: 'csv_content', csvContent: precomputed }],
        options: { colorMode: 'banded', legendText: ['Low end', 'Lower half', 'Upper half', 'High end'] },
        fieldConfig: { defaults: { color: { mode: 'thresholds' }, thresholds: bands }, overrides: [] },
      }),
    ],
  });
}

function edgePlan() {
  const cases = [
    'Normal',
    'Offline sensor',
    'Stale reading',
    'Humidity only',
    'Invalid limits',
    'Index above 100',
    'Not bound',
    'Text values',
  ];
  const rooms = cases.map((zone, i) => {
    const x = 20 + (i % 4) * 190;
    const y = 20 + Math.floor(i / 4) * 170;
    return room(`case-${i + 1}`, zone, x, y, 180, 160, { fontSize: 15 });
  });
  const body = `  <g inkscape:groupmode="layer" id="layer-rooms" inkscape:label="Rooms">
${rooms.join('\n')}
  </g>`;
  return svgDocument({ width: 800, height: 380, title: 'Edge cases', body });
}

function edgeCases(plan) {
  const current = toCsv(
    ['sensor', 'label', 'temperature', 'humidity', 'humidity_low', 'humidity_high', 'status_index'],
    [
      { sensor: 'case-normal', label: 'Normal', temperature: 22.4, humidity: 44 },
      { sensor: 'case-humidity', label: 'Humidity only', humidity: 57.5 },
      {
        sensor: 'case-limits',
        label: 'Invalid limits',
        temperature: 23,
        humidity: 50,
        humidity_low: 65,
        humidity_high: 35,
      },
      { sensor: 'case-index', label: 'Index above 100', status_index: 140 },
      { sensor: 'case-extra', label: 'Sensor with no zone', temperature: 21, humidity: 40 },
    ]
  );
  // A separate query: text in a column turns the whole column into text.
  const text = toCsv(
    ['sensor', 'label', 'temperature', 'humidity'],
    [{ sensor: 'case-text', label: 'Text values', temperature: 'n/a', humidity: 'error' }]
  );
  const old = toCsv(
    ['time', 'sensor', 'label', 'temperature', 'humidity'],
    [{ time: '2026-01-01T08:00:00Z', sensor: 'case-stale', label: 'Stale reading', temperature: 21.2, humidity: 41 }]
  );
  return dashboard({
    uid: 'cfm-edge-cases',
    title: 'Climate Floor Map: Edge cases',
    panels: [
      floorPanel({
        id: 1,
        title: 'One zone per state (offline after 15 min)',
        gridPos: { x: 0, y: 0, w: 24, h: 16 },
        plan,
        bindings: {
          Normal: 'case-normal',
          'Offline sensor': 'case-missing',
          'Stale reading': 'case-stale',
          'Humidity only': 'case-humidity',
          'Invalid limits': 'case-limits',
          'Index above 100': 'case-index',
          'Text values': 'case-text',
        },
        targets: [
          { refId: 'A', datasource: DATASOURCE, scenarioId: 'csv_content', csvContent: current },
          { refId: 'B', datasource: DATASOURCE, scenarioId: 'csv_content', csvContent: old },
          { refId: 'C', datasource: DATASOURCE, scenarioId: 'csv_content', csvContent: text },
        ],
        options: { staleAfterMinutes: 15 },
      }),
    ],
  });
}

function largeFloor(plan, zones, random) {
  const rows = zones.map((zone, i) => ({
    sensor: `sensor-${String(i + 101).padStart(3, '0')}`,
    label: zone,
    temperature: round(19 + random() * 8.5),
    humidity: round(28 + random() * 36),
  }));
  return dashboard({
    uid: 'cfm-large-floor',
    title: 'Climate Floor Map: Large floor',
    panels: [
      floorPanel({
        id: 1,
        title: '36 bays',
        gridPos: { x: 0, y: 0, w: 24, h: 22 },
        plan,
        bindings: Object.fromEntries(rows.map((r) => [r.label, r.sensor])),
        targets: [
          {
            refId: 'A',
            datasource: DATASOURCE,
            scenarioId: 'csv_content',
            csvContent: toCsv(['sensor', 'label', 'temperature', 'humidity'], rows),
          },
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------------------------

function build() {
  const random = seededRandom(SEED);
  const office = officePlan();
  const large = largePlan();
  const edge = edgePlan();
  const waves = officeWaves(random);
  const snapshot = officeSnapshot(seededRandom(SEED + 1), 80);

  const files = new Map([
    [join(PLAN_DIR, 'office.svg'), office.svg],
    [join(PLAN_DIR, 'large-floor.svg'), large.svg],
    [join(PLAN_DIR, 'edge-cases.svg'), edge],
    [join(DASHBOARD_DIR, 'live-floor.json'), liveFloor(office.svg, waves)],
    [join(DASHBOARD_DIR, 'zone-detail.json'), zoneDetail(waves)],
    [join(DASHBOARD_DIR, 'layouts.json'), layouts(office.svg, waves, snapshot)],
    [join(DASHBOARD_DIR, 'edge-cases.json'), edgeCases(edge)],
    [join(DASHBOARD_DIR, 'large-floor.json'), largeFloor(large.svg, large.zones, seededRandom(SEED + 2))],
  ]);
  return new Map(
    Array.from(files, ([path, content]) => [
      path,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    ])
  );
}

const files = build();
if (process.argv.includes('--check')) {
  const stale = Array.from(files).filter(([path, content]) => {
    try {
      return readFileSync(path, 'utf8') !== content;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error('Demo files are out of date. Run `npm run demo:generate` and commit the result:');
    stale.forEach(([path]) => console.error(`  ${path.slice(ROOT.length + 1)}`));
    process.exit(1);
  }
  console.log(`Demo files are up to date (${files.size} files).`);
} else {
  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  console.log(`Wrote ${files.size} demo files.`);
}
