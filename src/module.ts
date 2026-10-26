import { FieldConfigProperty, PanelPlugin, SelectableValue } from '@grafana/data';
import { SensorFieldConfig, SensorFloorOptions } from './types';
import { parseMetricList, readingsFromFrames } from './data/readings';
import { SensorFloorPanel } from './components/SensorFloorPanel';
import { RoomBindingsEditor } from './components/RoomBindingsEditor';
import { FloorPlanOption } from './components/FloorPlanOption';
import { DEMO_FLOOR_PLAN } from './svg/demoPlan';

const PLAN = ['Plan drawing'];
const DATA = ['Data'];
const LIMITS = ['Limits'];
const DISPLAY = ['Display'];
const ROOMS = ['Rooms'];
const LINK = ['Room link'];

const autoDetect = 'Leave blank to detect it from common names.';

const limitHelp = 'Limits sent with the data win. Without any, well-known metrics use built-in defaults.';

export const plugin = new PanelPlugin<SensorFloorOptions>(SensorFloorPanel)
  .setNoPadding()
  .useFieldConfig({
    disableStandardOptions: [
      FieldConfigProperty.Min,
      FieldConfigProperty.Max,
      FieldConfigProperty.FieldMinMax,
      FieldConfigProperty.Thresholds,
      FieldConfigProperty.Mappings,
      FieldConfigProperty.Color,
      FieldConfigProperty.Links,
      FieldConfigProperty.Actions,
      FieldConfigProperty.Filterable,
    ],
    useCustomConfig: (builder) =>
      builder
        .addNumberInput({
          path: 'limitMin',
          name: 'Limit min',
          description: `Lowest acceptable value. Set it per metric with an override. ${limitHelp}`,
          category: ['Limits'],
        })
        .addNumberInput({
          path: 'limitMax',
          name: 'Limit max',
          description: `Highest acceptable value. Leave the other side blank for a one-sided limit. ${limitHelp}`,
          category: ['Limits'],
        }),
  } as Parameters<PanelPlugin<SensorFloorOptions, SensorFieldConfig>['useFieldConfig']>[0])
  .setPanelOptions((builder) =>
    builder
      .addCustomEditor({
        id: 'floorPlan',
        path: 'floorPlan',
        name: 'Plan',
        description: 'Draw rooms in the editor, generate them from the query, or paste SVG under SVG source.',
        category: PLAN,
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
        path: 'metrics',
        name: 'Metrics',
        description:
          'Comma-separated names of the numeric fields to use, in this order, e.g. "temperature, humidity, co2". Blank uses every numeric field. Units, decimals and limits are set per field under Standard options and Limits, or per metric with overrides.',
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
      .addSliderInput({
        path: 'warningMargin',
        name: 'Warning margin (%)',
        description:
          'How close to a limit counts as near it: a share of the band on each side, or of the limit itself when there is only one.',
        category: LIMITS,
        defaultValue: 10,
        settings: { min: 0, max: 50, step: 1 },
      })
      .addSelect({
        path: 'colorBy',
        name: 'Colour rooms by',
        description: 'Status (within, near or out of limits), or where one metric sits inside its limits.',
        category: DISPLAY,
        defaultValue: 'status',
        settings: {
          allowCustomValue: true,
          options: [{ value: 'status', label: 'Status' }],
          getOptions: async (context) => {
            const options = context.options as SensorFloorOptions | undefined;
            const { metrics } = readingsFromFrames(
              context.data ?? [],
              { sensor: options?.sensorField, location: options?.locationField },
              parseMetricList(options?.metrics)
            );
            const status: SelectableValue<string> = {
              value: 'status',
              label: 'Status',
              description: 'Within, near or out of limits',
            };
            return [
              status,
              ...metrics.map((m) => ({ value: m.key, label: m.name, description: 'Position in its limits' })),
            ];
          },
        },
      })
      .addBooleanSwitch({
        path: 'showValues',
        name: 'Show values in rooms',
        category: DISPLAY,
        defaultValue: true,
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
