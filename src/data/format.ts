import { FieldType, formattedValueToString, getDisplayProcessor, GrafanaTheme2 } from '@grafana/data';
import { Limits, MetricInfo } from '../types';
import { WELL_KNOWN } from './metrics';

export type Formatter = (value: number) => string;

/** Formats a metric's values with its field config unit and decimals, or the well-known unit. */
export function metricFormatter(metric: MetricInfo, theme: GrafanaTheme2): Formatter {
  const display = getDisplayProcessor({
    field: {
      type: FieldType.number,
      // Without a setting or a well-known default, Grafana picks the decimals itself.
      config: {
        unit: metric.unit ?? WELL_KNOWN[metric.key]?.unit,
        decimals: metric.decimals ?? WELL_KNOWN[metric.key]?.decimals,
      },
    },
    theme,
  });
  return (value) => formattedValueToString(display(value));
}

/** "18 °C – 27 °C", "≤ 1000 ppm" or "≥ 20 %". */
export function formatLimits(limits: Limits, format: Formatter): string {
  const { min, max } = limits;
  if (min !== undefined && max !== undefined) {
    return `${format(min)} – ${format(max)}`;
  }
  return max !== undefined ? `≤ ${format(max)}` : `≥ ${format(min as number)}`;
}
