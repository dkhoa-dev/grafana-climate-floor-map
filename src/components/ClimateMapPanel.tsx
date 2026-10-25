import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Alert, useStyles2, useTheme2 } from '@grafana/ui';
import { collectReadings } from '../data/readings';
import { buildDetailLink, openLink } from '../links/zoneLink';
import { DEFAULT_LABEL_ATTRIBUTE, DEFAULT_ZONE_TAG } from '../plan/marking';
import { preparePlan } from '../plan/preparePlan';
import { buildLegend } from '../render/legend';
import { PlanDom } from '../render/planDom';
import { computeZoneStates, ZoneVisual, zoneVisual } from '../render/zoneStates';
import { FloorMapOptions } from '../types';
import { Legend } from './Legend';
import { PlanView } from './PlanView';
import { ZoneTooltip } from './ZoneTooltip';

export const README_PLAN_SECTION = 'https://github.com/dkhoa-dev/grafana-climate-floor-map#draw-and-mark-a-floor-plan';

/** How often ages are re-evaluated while a staleness threshold is set or a tooltip is open. */
const CLOCK_MS = 30_000;

interface Props extends PanelProps<FloorMapOptions> {
  /** Test hook: receives the plan DOM handle after each apply. */
  onPlanApplied?: (dom: PlanDom) => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    overflow: 'hidden',
  }),
  notice: css({ flex: '0 0 auto', marginBottom: 0 }),
  empty: css({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
  }),
});

/** Wall-clock time that ticks only while `active`; `touch` moves it to the current time. */
function useClock(active: boolean): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  const touch = useCallback(() => setNow(Date.now()), []);
  return [now, touch];
}

interface Hover {
  zone: string;
  x: number;
  y: number;
}

export function ClimateMapPanel({
  options,
  data,
  width,
  height,
  fieldConfig,
  timeZone,
  replaceVariables,
  onPlanApplied,
}: Props) {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const idPrefix = `cfm${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  const [hover, setHover] = useState<Hover | undefined>();
  const hoveredZone = useRef<string | undefined>(undefined);

  const labelAttribute = options.labelAttribute || DEFAULT_LABEL_ATTRIBUTE;
  const zoneTag = options.zoneTag || DEFAULT_ZONE_TAG;
  const plan = useMemo(
    () => preparePlan(options.planMarkup, { labelAttribute, zoneTag }, idPrefix),
    [options.planMarkup, labelAttribute, zoneTag, idPrefix]
  );
  const readings = useMemo(() => collectReadings(data.series, options.fields), [data.series, options.fields]);

  const [clock, touchClock] = useClock(options.staleAfterMinutes > 0 || hover !== undefined);
  // A refresh moves the end of the time range forward, so ages follow the data even between ticks.
  const now = Math.max(clock, data.timeRange?.to?.valueOf() ?? 0);
  const zoneNames = useMemo(() => (plan.kind === 'ready' ? plan.zones.map((z) => z.name) : []), [plan]);
  const states = useMemo(
    () => computeZoneStates(zoneNames, options, readings, now),
    [zoneNames, options, readings, now]
  );
  const visuals = useMemo(() => {
    const out = new Map<string, ZoneVisual>();
    for (const [zone, state] of states) {
      out.set(zone, zoneVisual(state, options, fieldConfig.defaults, theme));
    }
    return out;
  }, [states, options, fieldConfig.defaults, theme]);
  const legend = useMemo(
    () => buildLegend(options, fieldConfig.defaults, theme),
    [options, fieldConfig.defaults, theme]
  );

  const clickable = !!options.linkTemplate?.trim();
  const onHover = useCallback(
    (zone: string | undefined, x: number, y: number) => {
      if (zone && zone !== hoveredZone.current) {
        touchClock();
      }
      hoveredZone.current = zone;
      setHover(zone ? { zone, x, y } : undefined);
    },
    [touchClock]
  );
  const onActivate = useCallback(
    (zone: string) => {
      const state = states.get(zone);
      const link = buildDetailLink(
        options.linkTemplate,
        { zone, sensorKey: state?.sensorKey, sensorLabel: state?.reading?.label },
        replaceVariables
      );
      if (link) {
        openLink(link, options.linkNewTab);
      }
    },
    [states, options.linkTemplate, options.linkNewTab, replaceVariables]
  );

  const box = { width, height };

  if (plan.kind === 'empty') {
    return (
      <div className={styles.empty} style={box} data-testid="cfm-empty">
        <strong>Add a floor plan to get started</strong>
        <span>
          Paste SVG markup into the Floor plan option, then mark each room as a zone.{' '}
          <a href={README_PLAN_SECTION} target="_blank" rel="noopener noreferrer">
            How to draw and mark a plan
          </a>
        </span>
      </div>
    );
  }
  if (plan.kind === 'error') {
    return (
      <div className={styles.empty} style={box} data-testid="cfm-error">
        <Alert title="Cannot show this floor plan" severity="error">
          {plan.message}
        </Alert>
      </div>
    );
  }

  const hasFrames = data.series.some((frame) => frame.length > 0);
  const boundCount = zoneNames.filter((zone) => options.bindings?.[zone]).length;
  let notice: string | undefined;
  if (plan.zones.length === 0) {
    notice = `No zones found. Label each room shape "<name> [${zoneTag}]" in Inkscape, or give it a data-${zoneTag} attribute.`;
  } else if (!hasFrames) {
    notice = 'No data. Run a query that returns sensor readings.';
  } else if (boundCount === 0) {
    notice = 'No zone is bound to a sensor yet. Open the Zone bindings option to bind them.';
  }

  const hovered = hover ? states.get(hover.zone) : undefined;

  return (
    <div className={styles.wrapper} style={box}>
      {notice && <Alert className={styles.notice} title={notice} severity="info" data-testid="cfm-notice" />}
      <PlanView
        svg={plan.svg}
        visuals={visuals}
        clickable={clickable}
        animate={options.animate}
        onHover={onHover}
        onActivate={onActivate}
        onApplied={onPlanApplied}
      />
      {options.showLegend && <Legend model={legend} />}
      {hover && hovered && (
        <ZoneTooltip
          state={hovered}
          x={hover.x}
          y={hover.y}
          decimals={options.decimals}
          timeZone={timeZone}
          now={now}
          staleAfterMinutes={options.staleAfterMinutes}
        />
      )}
    </div>
  );
}
