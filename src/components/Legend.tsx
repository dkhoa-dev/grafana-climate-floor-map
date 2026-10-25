import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { LegendModel } from '../render/legend';

export const LEGEND_HEIGHT = 36;

const getStyles = (theme: GrafanaTheme2) => ({
  legend: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    minHeight: LEGEND_HEIGHT,
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  bar: css({
    width: 'min(320px, 80%)',
    height: 8,
    borderRadius: theme.shape.radius.default,
  }),
  barLabels: css({
    width: 'min(320px, 80%)',
    display: 'flex',
    justifyContent: 'space-between',
  }),
  swatches: css({
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing(1.5),
  }),
  swatch: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  }),
  chip: css({
    width: 12,
    height: 12,
    borderRadius: theme.shape.radius.default,
  }),
});

export function Legend({ model }: { model: LegendModel }) {
  const styles = useStyles2(getStyles);
  if (model.kind === 'gradient') {
    return (
      <div className={styles.legend} data-testid="cfm-legend">
        <div className={styles.bar} style={{ background: model.gradient }} />
        <div className={styles.barLabels}>
          {model.items.map((item, i) => (
            <span key={i}>{item.label}</span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.legend} data-testid="cfm-legend">
      <div className={styles.swatches}>
        {model.items.map((item, i) => (
          <span key={i} className={styles.swatch}>
            <span className={styles.chip} style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
