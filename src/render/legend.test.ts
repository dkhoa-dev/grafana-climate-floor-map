import { createTheme, ThresholdsMode } from '@grafana/data';
import { buildLegend, GRADIENT_LABELS } from './legend';

const theme = createTheme();

describe('buildLegend', () => {
  it('draws a gradient with labels that match the index mode', () => {
    const position = buildLegend({ colorMode: 'continuous', indexMode: 'position', legendText: [] }, {}, theme);
    expect(position.kind).toBe('gradient');
    expect(position.gradient).toMatch(/^linear-gradient\(to right, .+ 0%, .+ 100%\)$/);
    expect(position.items.map((i) => i.label)).toEqual(GRADIENT_LABELS.position);
    const deviation = buildLegend({ colorMode: 'continuous', indexMode: 'deviation', legendText: [] }, {}, theme);
    expect(deviation.items.map((i) => i.label)).toEqual(GRADIENT_LABELS.deviation);
  });

  it('shows one swatch per threshold step in banded mode', () => {
    const config = {
      thresholds: {
        mode: ThresholdsMode.Absolute,
        steps: [
          { value: -Infinity, color: 'green' },
          { value: 40, color: 'orange' },
          { value: 80, color: 'red' },
        ],
      },
    };
    const legend = buildLegend(
      { colorMode: 'banded', indexMode: 'position', legendText: ['', 'Watch'] },
      config,
      theme
    );
    expect(legend.items).toEqual([
      { color: theme.visualization.getColorByName('green'), label: 'Below 40' },
      { color: theme.visualization.getColorByName('orange'), label: 'Watch' },
      { color: theme.visualization.getColorByName('red'), label: '80 and above' },
    ]);
  });
});
