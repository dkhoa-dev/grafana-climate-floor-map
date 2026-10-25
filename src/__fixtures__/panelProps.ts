import { DataFrame, FieldConfigSource, getDefaultTimeRange, LoadingState, PanelProps } from '@grafana/data';
import { EMPTY_ROLE_OVERRIDES } from '../data/fieldRoles';
import { FloorMapOptions } from '../types';

export const DEFAULT_OPTIONS: FloorMapOptions = {
  planMarkup: '',
  labelAttribute: 'inkscape:label',
  zoneTag: 'zone',
  fields: { ...EMPTY_ROLE_OVERRIDES },
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

export function panelProps(options: Partial<FloorMapOptions>, series: DataFrame[] = []): PanelProps<FloorMapOptions> {
  const timeRange = getDefaultTimeRange();
  const fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };
  return {
    id: 1,
    data: { series, state: LoadingState.Done, timeRange },
    timeRange,
    timeZone: 'utc',
    options: { ...DEFAULT_OPTIONS, ...options },
    fieldConfig,
    transparent: false,
    width: 600,
    height: 400,
    renderCounter: 0,
    title: 'Floor',
    eventBus: {
      publish: jest.fn(),
      subscribe: jest.fn(),
      getStream: jest.fn(),
      removeAllListeners: jest.fn(),
      newScopedBus: jest.fn(),
    } as any,
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    replaceVariables: (text: string) => text,
    onChangeTimeRange: jest.fn(),
  };
}
