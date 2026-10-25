import { formattedValueToString, getValueFormat } from '@grafana/data';
import { MetricId } from '../types';

export const MISSING = '–';

const DEFAULT_UNITS: Record<MetricId, string> = { temperature: 'celsius', humidity: 'percent' };

/** Formats a metric with the unit from the data's field config, or °C / % when the data sets none. */
export function formatMetric(metric: MetricId, value: number | undefined, decimals: number, unit?: string): string {
  if (value === undefined) {
    return MISSING;
  }
  const format = getValueFormat(unit || DEFAULT_UNITS[metric]);
  return formattedValueToString(format(value, decimals));
}

/** "just now", "3 min ago", "2 h ago", "4 d ago". */
export function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours} h ago`;
  }
  return `${Math.floor(hours / 24)} d ago`;
}
