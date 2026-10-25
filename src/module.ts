import { PanelPlugin } from '@grafana/data';
import { ClimateFloorOptions } from './types';
import { ClimateFloorPanel } from './components/ClimateFloorPanel';
import { RoomBindingsEditor } from './components/RoomBindingsEditor';
import { FloorPlanOption } from './components/FloorPlanOption';
import { DEMO_FLOOR_PLAN } from './svg/demoPlan';

const FLOOR = ['Floor plan'];
const DATA = ['Data'];
const LIMITS = ['Limits'];
const DISPLAY = ['Display'];
const ROOMS = ['Rooms'];
const LINK = ['Room link'];

const autoDetect = 'Leave blank to detect it from common names.';

export const plugin = new PanelPlugin<ClimateFloorOptions>(ClimateFloorPanel)
  .setNoPadding()
  .setPanelOptions((builder) =>
    builder
      .addCustomEditor({
        id: 'floorPlan',
        path: 'floorPlan',
        name: 'Plan',
        description: 'Draw rooms in the editor, generate them from the query, or paste SVG under SVG source.',
        category: FLOOR,
        defaultValue: DEMO_FLOOR_PLAN,
        editor: FloorPlanOption,
      })
      .addTextInput({
        path: 'sensorField',
        name: 'Sensor field or label',
        description: `Identifies each sensor. ${autoDetect}`,
        category: DATA,
        defaultValue: '',
      })
      .addTextInput({
        path: 'locationField',
        name: 'Location field or label',
        description: `Human-readable place, also used for auto-binding. ${autoDetect}`,
        category: DATA,
        defaultValue: '',
      })
      .addTextInput({
        path: 'temperatureField',
        name: 'Temperature field',
        description: autoDetect,
        category: DATA,
        defaultValue: '',
      })
      .addTextInput({
        path: 'humidityField',
        name: 'Humidity field',
        description: autoDetect,
        category: DATA,
        defaultValue: '',
      })
      .addTextInput({
        path: 'staleAfter',
        name: 'Offline after',
        description: 'A room is shown as offline when its newest reading is older than this, e.g. 15m. Blank disables.',
        category: DATA,
        defaultValue: '15m',
      })
      .addNumberInput({
        path: 'temperatureMin',
        name: 'Temperature min (°C)',
        description: 'Used when the data carries no limits for a sensor.',
        category: LIMITS,
        defaultValue: 18,
      })
      .addNumberInput({
        path: 'temperatureMax',
        name: 'Temperature max (°C)',
        category: LIMITS,
        defaultValue: 27,
      })
      .addNumberInput({
        path: 'humidityMin',
        name: 'Humidity min (%RH)',
        category: LIMITS,
        defaultValue: 30,
      })
      .addNumberInput({
        path: 'humidityMax',
        name: 'Humidity max (%RH)',
        category: LIMITS,
        defaultValue: 60,
      })
      .addSliderInput({
        path: 'warningMargin',
        name: 'Warning margin (%)',
        description: 'Share of the band, on each side, where a value counts as near the limit.',
        category: LIMITS,
        defaultValue: 10,
        settings: { min: 0, max: 50, step: 1 },
      })
      .addRadio({
        path: 'colorBy',
        name: 'Colour rooms by',
        category: DISPLAY,
        defaultValue: 'status',
        settings: {
          options: [
            { value: 'status', label: 'Status', description: 'Within, near or out of limits' },
            { value: 'temperature', label: 'Temperature', description: 'Position of the temperature in its band' },
            { value: 'humidity', label: 'Humidity', description: 'Position of the humidity in its band' },
          ],
        },
      })
      .addBooleanSwitch({
        path: 'showValues',
        name: 'Show values in rooms',
        category: DISPLAY,
        defaultValue: true,
      })
      .addNumberInput({
        path: 'decimals',
        name: 'Decimals',
        category: DISPLAY,
        defaultValue: 1,
        settings: { min: 0, max: 3, integer: true },
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Show legend',
        category: DISPLAY,
        defaultValue: true,
      })
      .addBooleanSwitch({
        path: 'autoBind',
        name: 'Auto-bind by name',
        description: 'Rooms without a chosen sensor use the sensor whose location or id matches the room name.',
        category: ROOMS,
        defaultValue: true,
      })
      .addCustomEditor({
        id: 'bindings',
        path: 'bindings',
        name: 'Sensor per room',
        category: ROOMS,
        defaultValue: {},
        editor: RoomBindingsEditor,
      })
      .addTextInput({
        path: 'linkUrl',
        name: 'URL',
        description:
          'Opened when a room is clicked. Supports dashboard variables plus ${room}, ${sensor} and ${location}. Blank disables.',
        category: LINK,
        defaultValue: '',
      })
      .addBooleanSwitch({
        path: 'linkNewTab',
        name: 'Open in new tab',
        category: LINK,
        defaultValue: false,
        showIf: (o) => Boolean(o.linkUrl),
      })
  );
