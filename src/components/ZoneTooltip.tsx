import React, { useLayoutEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { dateTimeFormat, GrafanaTheme2 } from '@grafana/data';
import { TimeZone } from '@grafana/schema';
import { Portal, useStyles2 } from '@grafana/ui';
import { LimitSource } from '../climate/statusIndex';
import { formatAge, formatMetric } from '../render/format';
import { ZoneState } from '../render/zoneStates';

const GAP = 12;

const SOURCE_TEXT: Record<LimitSource, string> = {
  data: 'from data',
  default: 'panel default',
  'default-invalid-data': 'panel default, data limits invalid',
};

const getStyles = (theme: GrafanaTheme2) => ({
  box: css({
    position: 'fixed',
    zIndex: theme.zIndex.tooltip,
    maxWidth: 300,
    padding: theme.spacing(1, 1.5),
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z2,
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodySmall.fontSize,
    pointerEvents: 'none',
  }),
  heading: css({
    fontWeight: theme.typography.fontWeightMedium,
    fontSize: theme.typography.body.fontSize,
  }),
  muted: css({ color: theme.colors.text.secondary }),
  warn: css({ color: theme.colors.warning.text }),
  rows: css({
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: theme.spacing(1.5),
    marginTop: theme.spacing(0.5),
  }),
});

interface Props {
  state: ZoneState;
  x: number;
  y: number;
  decimals: number;
  timeZone: TimeZone;
  now: number;
  staleAfterMinutes: number;
}

/** Keeps a box of the given size near the pointer and inside the viewport. */
export function placeNear(x: number, y: number, width: number, height: number, viewW: number, viewH: number) {
  let left = x + GAP;
  let top = y + GAP;
  if (left + width > viewW) {
    left = Math.max(0, x - GAP - width);
  }
  if (top + height > viewH) {
    top = Math.max(0, y - GAP - height);
  }
  return { left, top };
}

export function ZoneTooltip({ state, x, y, decimals, timeZone, now, staleAfterMinutes }: Props) {
  const styles = useStyles2(getStyles);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x + GAP, top: y + GAP });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    setPosition(placeNear(x, y, box?.width ?? 0, box?.height ?? 0, window.innerWidth, window.innerHeight));
  }, [x, y, state]);

  const reading = state.reading;
  const title = reading?.label ?? state.zone;

  let body: React.ReactNode;
  if (state.status === 'unbound') {
    body = <div className={styles.muted}>No sensor bound</div>;
  } else if (state.status === 'offline') {
    body = <div className={styles.warn}>No data from {state.sensorKey}</div>;
  } else {
    const index = state.index;
    const temperatureScore = index?.metrics.find((m) => m.metric === 'temperature');
    const humidityScore = index?.metrics.find((m) => m.metric === 'humidity');
    const limitText = (score: typeof temperatureScore, metric: 'temperature' | 'humidity') => {
      if (!score) {
        return '–';
      }
      const unit = metric === 'temperature' ? reading?.temperatureUnit : reading?.humidityUnit;
      const low = formatMetric(metric, score.limits.low, decimals, unit);
      const high = formatMetric(metric, score.limits.high, decimals, unit);
      return `${low} to ${high} (${SOURCE_TEXT[score.limits.source]})`;
    };
    body = (
      <>
        <div className={styles.rows}>
          <span className={styles.muted}>Temperature</span>
          <span>{formatMetric('temperature', reading?.temperature, decimals, reading?.temperatureUnit)}</span>
          <span className={styles.muted}>Humidity</span>
          <span>{formatMetric('humidity', reading?.humidity, decimals, reading?.humidityUnit)}</span>
          <span className={styles.muted}>Temperature band</span>
          <span>{limitText(temperatureScore, 'temperature')}</span>
          <span className={styles.muted}>Humidity band</span>
          <span>{limitText(humidityScore, 'humidity')}</span>
          <span className={styles.muted}>Status index</span>
          <span>
            {index?.value !== undefined ? `${Math.round(index.value)} / 100` : '–'}
            {index?.precomputed ? ' (from data)' : ''}
          </span>
          {index && index.metrics.length > 0 && (
            <>
              <span className={styles.muted}>Per metric</span>
              <span>
                {index.metrics
                  .map((m) => `${m.metric === 'temperature' ? 'temp.' : 'hum.'} ${Math.round(m.score)}`)
                  .join(', ')}
              </span>
            </>
          )}
          {reading?.time !== undefined && (
            <>
              <span className={styles.muted}>Reading</span>
              <span>
                {dateTimeFormat(reading.time, { timeZone })} ({formatAge(Math.max(0, now - reading.time))})
              </span>
            </>
          )}
        </div>
        {index?.clamped && <div className={styles.warn}>Index from data was outside 0–100 and was clamped.</div>}
        {state.status === 'stale' && (
          <div className={styles.warn}>Stale: older than {staleAfterMinutes} min, treated as offline.</div>
        )}
      </>
    );
  }

  return (
    <Portal>
      <div ref={ref} className={styles.box} style={position} role="tooltip" data-testid="cfm-tooltip">
        <div className={styles.heading}>{title}</div>
        {state.sensorKey && <div className={styles.muted}>Sensor {state.sensorKey}</div>}
        {body}
      </div>
    </Portal>
  );
}
