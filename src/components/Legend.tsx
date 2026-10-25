import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { ColorBy, RoomState, RoomStatus } from '../types';
import { ColorLookup, STATUS_COLOR, STATUS_LABEL, valueColor } from '../data/colors';

export const LEGEND_HEIGHT = 28;

interface Props {
  colorBy: ColorBy;
  lookup: ColorLookup;
  states: Map<string, RoomState>;
}

const STATUSES: RoomStatus[] = ['ok', 'warning', 'alarm', 'offline'];

export const Legend: React.FC<Props> = ({ colorBy, lookup, states }) => {
  const styles = useStyles2(getStyles);

  if (colorBy !== 'status') {
    const stops = [-0.01, 0, 0.25, 0.5, 0.75, 1, 1.01].map((p) => valueColor(p, lookup));
    return (
      <div className={styles.legend} data-testid="climate-floor-legend">
        <span>Below limit</span>
        <span className={styles.bar} style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }} />
        <span>Above limit</span>
        <span className={styles.muted}>{colorBy === 'temperature' ? 'Temperature' : 'Humidity'}</span>
      </div>
    );
  }

  const counts = new Map<RoomStatus, number>();
  states.forEach((s) => counts.set(s.status, (counts.get(s.status) ?? 0) + 1));

  return (
    <div className={styles.legend} data-testid="climate-floor-legend">
      {STATUSES.map((status) => (
        <span key={status} className={styles.item}>
          <span className={styles.swatch} style={{ background: lookup(STATUS_COLOR[status]) }} />
          {STATUS_LABEL[status]}
          <span className={styles.muted}>{counts.get(status) ?? 0}</span>
        </span>
      ))}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  legend: css({
    height: LEGEND_HEIGHT,
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    fontSize: theme.typography.bodySmall.fontSize,
    overflow: 'hidden',
  }),
  item: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  }),
  swatch: css({
    width: 12,
    height: 12,
    borderRadius: theme.shape.radius.default,
  }),
  bar: css({
    width: 140,
    height: 10,
    borderRadius: theme.shape.radius.default,
  }),
  muted: css({
    color: theme.colors.text.secondary,
  }),
});
