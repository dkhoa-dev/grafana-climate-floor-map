import React from 'react';
import { css } from '@emotion/css';
import { dateTimeFormat, GrafanaTheme2 } from '@grafana/data';
import { TimeZone } from '@grafana/schema';
import { useStyles2, useTheme2 } from '@grafana/ui';
import { Level, MetricInfo, RoomState } from '../types';
import { STATUS_COLOR, STATUS_LABEL } from '../data/colors';
import { formatLimits, Formatter } from '../data/format';

interface Props {
  state: RoomState;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  metrics: MetricInfo[];
  formatters: Map<string, Formatter>;
  timeZone: TimeZone;
}

const WIDTH = 260;
const OFFSET = 12;

const LEVEL_TEXT: Record<Level, string> = { ok: '', warning: ' (near limit)', alarm: ' (out of limits)' };

export const RoomTooltip: React.FC<Props> = ({
  state,
  x,
  y,
  containerWidth,
  containerHeight,
  metrics,
  formatters,
  timeZone,
}) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const { reading } = state;

  // Flip to the other side of the cursor near the right or bottom edge.
  const left = x + OFFSET + WIDTH > containerWidth ? Math.max(0, x - OFFSET - WIDTH) : x + OFFSET;
  const flipUp = y > containerHeight / 2;

  const metricRows: Array<[string, string]> = state.metrics.map((m) => {
    const format = formatters.get(m.key) ?? String;
    const name = metrics.find((info) => info.key === m.key)?.name ?? m.key;
    const level = m.level ? LEVEL_TEXT[m.level] : '';
    const limits = m.limits ? ` · limits ${formatLimits(m.limits, format)}` : '';
    return [name, `${format(m.value)}${level}${limits}`];
  });

  const rows: Array<[string, string | undefined]> = [
    ['Location', reading?.location],
    ['Sensor', reading?.sensor],
    ...metricRows,
    ['Updated', reading?.time !== undefined ? dateTimeFormat(reading.time, { timeZone }) : undefined],
  ];

  const statusColor =
    state.status === 'offline'
      ? theme.colors.text.disabled
      : state.status === 'unbound'
        ? theme.colors.text.secondary
        : theme.visualization.getColorByName(STATUS_COLOR[state.status]);

  return (
    <div
      className={styles.tooltip}
      style={{ left, ...(flipUp ? { bottom: containerHeight - y + OFFSET } : { top: y + OFFSET }) }}
      data-testid="climate-floor-tooltip"
    >
      <div className={styles.title}>{state.room}</div>
      <div className={styles.status}>
        <span className={styles.dot} style={{ background: statusColor }} />
        {STATUS_LABEL[state.status]}
      </div>
      {rows
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([label, value]) => (
          <div key={label} className={styles.row}>
            <span className={styles.label}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  tooltip: css({
    position: 'absolute',
    width: WIDTH,
    padding: theme.spacing(1),
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z2,
    fontSize: theme.typography.bodySmall.fontSize,
    pointerEvents: 'none',
    zIndex: 1,
  }),
  title: css({
    fontWeight: theme.typography.fontWeightMedium,
    marginBottom: theme.spacing(0.5),
  }),
  status: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    marginBottom: theme.spacing(0.5),
  }),
  dot: css({
    width: 8,
    height: 8,
    borderRadius: '50%',
    flex: '0 0 auto',
  }),
  row: css({
    display: 'grid',
    gridTemplateColumns: '84px 1fr',
    gap: theme.spacing(1),
  }),
  label: css({
    color: theme.colors.text.secondary,
  }),
});
