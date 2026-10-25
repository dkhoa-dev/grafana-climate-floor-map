import { FieldConfig, GrafanaTheme2, sortThresholds, Threshold } from '@grafana/data';
import { FloorMapOptions, IndexMode } from '../types';
import { DEFAULT_THRESHOLDS, indexColor, paintColor } from './zoneStates';

export interface LegendItem {
  color: string;
  label: string;
}

export interface LegendModel {
  kind: 'gradient' | 'swatches';
  /** CSS gradient for the bar, gradient kind only. */
  gradient?: string;
  items: LegendItem[];
}

/** Default wording for the three gradient labels (low end, middle, high end). */
export const GRADIENT_LABELS: Record<IndexMode, [string, string, string]> = {
  position: ['At low limit', 'Mid-band', 'At high limit'],
  deviation: ['Inside band', 'Half a band out', 'A band or more out'],
};

function bandLabel(steps: Threshold[], i: number): string {
  const from = steps[i].value;
  const to = steps[i + 1]?.value;
  if (!Number.isFinite(from)) {
    return to === undefined ? 'All values' : `Below ${to}`;
  }
  return to === undefined ? `${from} and above` : `${from} to ${to}`;
}

export function buildLegend(
  options: Pick<FloorMapOptions, 'colorMode' | 'indexMode' | 'legendText'>,
  config: FieldConfig,
  theme: GrafanaTheme2
): LegendModel {
  const custom = options.legendText ?? [];
  const pick = (i: number, fallback: string) => (custom[i]?.trim() ? custom[i].trim() : fallback);

  if (options.colorMode === 'banded') {
    const thresholds = config.thresholds?.steps?.length ? config.thresholds : DEFAULT_THRESHOLDS;
    const steps = sortThresholds(thresholds.steps);
    return {
      kind: 'swatches',
      items: steps.map((step, i) => ({
        color: paintColor(step.color, theme),
        label: pick(i, bandLabel(steps, i)),
      })),
    };
  }

  const stops = Array.from({ length: 11 }, (_, i) => {
    const at = i * 10;
    return `${indexColor(at, 'continuous', config, theme)} ${at}%`;
  });
  const defaults = GRADIENT_LABELS[options.indexMode] ?? GRADIENT_LABELS.position;
  return {
    kind: 'gradient',
    gradient: `linear-gradient(to right, ${stops.join(', ')})`,
    items: defaults.map((label, i) => ({ color: '', label: pick(i, label) })),
  };
}
