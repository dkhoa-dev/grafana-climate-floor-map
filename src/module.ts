import { FieldColorModeId, FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { FALLBACK_LIMITS } from './climate/statusIndex';
import { ClimateMapPanel } from './components/ClimateMapPanel';
import { EMPTY_ROLE_OVERRIDES, FieldRole } from './data/fieldRoles';
import { BindingEditor } from './editor/BindingEditor';
import { LINK_TOKENS } from './links/zoneLink';
import { DEFAULT_LABEL_ATTRIBUTE, DEFAULT_ZONE_TAG } from './plan/marking';
import { DEFAULT_THRESHOLDS } from './render/zoneStates';
import { FloorMapOptions } from './types';

const ROLE_FIELDS: Array<[FieldRole, string]> = [
  ['sensorKey', 'Sensor key'],
  ['sensorLabel', 'Sensor label'],
  ['temperature', 'Temperature'],
  ['humidity', 'Humidity'],
  ['temperatureLow', 'Temperature low limit'],
  ['temperatureHigh', 'Temperature high limit'],
  ['humidityLow', 'Humidity low limit'],
  ['humidityHigh', 'Humidity high limit'],
  ['time', 'Time'],
  ['statusIndex', 'Ready-made status index'],
];

export const plugin = new PanelPlugin<FloorMapOptions>(ClimateMapPanel)
  .useFieldConfig({
    disableStandardOptions: [
      FieldConfigProperty.Min,
      FieldConfigProperty.Max,
      FieldConfigProperty.DisplayName,
      FieldConfigProperty.NoValue,
      FieldConfigProperty.Links,
      FieldConfigProperty.Mappings,
      FieldConfigProperty.Actions,
      FieldConfigProperty.FieldMinMax,
    ],
    standardOptions: {
      [FieldConfigProperty.Color]: {
        defaultValue: { mode: FieldColorModeId.ContinuousBlYlRd },
        settings: { byValueSupport: true, bySeriesSupport: false, preferThresholdsMode: false },
      },
      [FieldConfigProperty.Thresholds]: { defaultValue: DEFAULT_THRESHOLDS },
    },
  })
  .setPanelOptions((builder) => {
    const planDrawing = 'Plan drawing';
    builder
      .addTextInput({
        category: [planDrawing],
        path: 'planMarkup',
        name: 'Plan SVG markup',
        description: 'Paste the SVG source of one floor. Scripts, images, styles and external links are removed.',
        defaultValue: '',
        settings: { useTextarea: true, rows: 8 },
      })
      .addTextInput({
        category: [planDrawing],
        path: 'zoneTag',
        name: 'Zone tag',
        description: 'Shapes labelled "<name> [zone]" become zones; "[zone title]" and "[zone readout]" mark text.',
        defaultValue: DEFAULT_ZONE_TAG,
      })
      .addTextInput({
        category: [planDrawing],
        path: 'labelAttribute',
        name: 'Label attribute',
        description: 'The SVG attribute that holds the label. Inkscape writes inkscape:label.',
        defaultValue: DEFAULT_LABEL_ATTRIBUTE,
      })
      .addCustomEditor({
        category: ['Zone bindings'],
        id: 'bindings',
        path: 'bindings',
        name: 'Sensor per zone',
        description: 'Pick the sensor that feeds each zone. The sensor key is saved, so renaming a label is safe.',
        editor: BindingEditor,
        defaultValue: {},
      });

    for (const [role, name] of ROLE_FIELDS) {
      builder.addFieldNamePicker({
        category: ['Data fields'],
        path: `fields.${role}`,
        name,
        description: 'Leave empty to detect it from the field type and name.',
        defaultValue: EMPTY_ROLE_OVERRIDES[role],
      });
    }

    const limits = 'Comfort band';
    builder
      .addNumberInput({
        category: [limits],
        path: 'limits.temperature.low',
        name: 'Temperature low',
        description: 'Used when the data has no limits. Default from EN 16798-1 Category II.',
        defaultValue: FALLBACK_LIMITS.temperature.low,
      })
      .addNumberInput({
        category: [limits],
        path: 'limits.temperature.high',
        name: 'Temperature high',
        defaultValue: FALLBACK_LIMITS.temperature.high,
      })
      .addNumberInput({
        category: [limits],
        path: 'limits.humidity.low',
        name: 'Humidity low',
        description: 'Relative humidity in %. Default after US EPA indoor humidity advice.',
        defaultValue: FALLBACK_LIMITS.humidity.low,
      })
      .addNumberInput({
        category: [limits],
        path: 'limits.humidity.high',
        name: 'Humidity high',
        defaultValue: FALLBACK_LIMITS.humidity.high,
      })
      .addNumberInput({
        category: [limits],
        path: 'staleAfterMinutes',
        name: 'Offline after (minutes)',
        description: 'A reading older than this counts as offline. 0 turns the check off.',
        defaultValue: 0,
        settings: { min: 0, integer: true },
      });

    const display = 'Display';
    builder
      .addRadio({
        category: [display],
        path: 'indexMode',
        name: 'Status index',
        description:
          'Position: where the value sits in its band (50 = mid-band). Deviation: 0 inside the band, rising outside it.',
        defaultValue: 'position',
        settings: {
          options: [
            { value: 'position', label: 'Position in band' },
            { value: 'deviation', label: 'Distance outside band' },
          ],
        },
      })
      .addRadio({
        category: [display],
        path: 'colorMode',
        name: 'Colouring',
        description: 'Smooth along the colour scheme, or one colour per threshold step.',
        defaultValue: 'continuous',
        settings: {
          options: [
            { value: 'continuous', label: 'Continuous' },
            { value: 'banded', label: 'Threshold bands' },
          ],
        },
      })
      .addNumberInput({
        category: [display],
        path: 'decimals',
        name: 'Readout decimals',
        defaultValue: 1,
        settings: { min: 0, max: 3, integer: true },
      })
      .addSliderInput({
        category: [display],
        path: 'fillOpacity',
        name: 'Fill opacity',
        defaultValue: 0.8,
        settings: { min: 0.1, max: 1, step: 0.05 },
      })
      .addBooleanSwitch({
        category: [display],
        path: 'animate',
        name: 'Fade colour changes',
        description: 'Off automatically when the system asks for reduced motion.',
        defaultValue: true,
      });

    builder
      .addBooleanSwitch({
        category: ['Legend'],
        path: 'showLegend',
        name: 'Show legend',
        defaultValue: true,
      })
      .addStringArray({
        category: ['Legend'],
        path: 'legendText',
        name: 'Legend text',
        description:
          'In order: three labels for the continuous bar, or one per threshold step. Blank keeps the default.',
        defaultValue: [],
        showIf: (o) => o.showLegend,
      });

    builder
      .addTextInput({
        category: ['Click-through'],
        path: 'linkTemplate',
        name: 'Detail link',
        description: `Leave empty to make zones not clickable. Tokens: ${LINK_TOKENS.zone}, ${LINK_TOKENS.sensor}, ${LINK_TOKENS.label}, plus dashboard variables.`,
        defaultValue: '',
      })
      .addBooleanSwitch({
        category: ['Click-through'],
        path: 'linkNewTab',
        name: 'Open in a new tab',
        defaultValue: true,
        showIf: (o) => !!o.linkTemplate,
      });

    return builder;
  });
