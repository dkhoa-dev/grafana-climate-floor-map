import React, { useLayoutEffect, useRef } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { ZONE_ATTR } from '../plan/preparePlan';
import { PlanDom, zoneFromTarget } from '../render/planDom';
import { ZoneVisual } from '../render/zoneStates';

interface Props {
  svg: string;
  visuals: Map<string, ZoneVisual>;
  clickable: boolean;
  animate: boolean;
  onHover: (zone: string | undefined, x: number, y: number) => void;
  onActivate: (zone: string) => void;
  /** Exposed for tests and the performance check. */
  onApplied?: (dom: PlanDom) => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  plan: css({
    flex: '1 1 auto',
    minHeight: 0,
    width: '100%',
    position: 'relative',
    '& > svg': { display: 'block', width: '100%', height: '100%' },
    [`& [${ZONE_ATTR}]:focus-visible`]: {
      outline: 'none',
      stroke: theme.colors.primary.border,
      strokeWidth: 3,
    },
  }),
  animated: css({
    [`& [${ZONE_ATTR}]`]: {
      transition: 'fill 450ms ease-out, fill-opacity 450ms ease-out',
    },
    '@media (prefers-reduced-motion: reduce)': {
      [`& [${ZONE_ATTR}]`]: { transition: 'none' },
    },
  }),
  clickable: css({
    [`& [${ZONE_ATTR}]`]: { cursor: 'pointer' },
  }),
});

/**
 * Inserts the sanitised plan once per plan change, then applies zone visuals on every refresh.
 * Event handlers are delegated to the container, so nothing has to be detached per zone.
 */
export function PlanView({ svg, visuals, clickable, animate, onHover, onActivate, onApplied }: Props) {
  const styles = useStyles2(getStyles);
  const host = useRef<HTMLDivElement>(null);
  const dom = useRef<PlanDom | null>(null);

  useLayoutEffect(() => {
    const el = host.current!;
    // The markup was sanitised by preparePlan before it reached this component.
    el.innerHTML = svg;
    dom.current = new PlanDom(el);
    return () => {
      dom.current = null;
      el.replaceChildren();
    };
  }, [svg]);

  useLayoutEffect(() => {
    if (dom.current) {
      dom.current.apply(visuals, clickable);
      onApplied?.(dom.current);
    }
  }, [svg, visuals, clickable, onApplied]);

  return (
    <div
      ref={host}
      data-testid="cfm-plan"
      className={cx(styles.plan, animate && styles.animated, clickable && styles.clickable)}
      onPointerMove={(e) => onHover(zoneFromTarget(e.target), e.clientX, e.clientY)}
      onPointerLeave={() => onHover(undefined, 0, 0)}
      onClick={(e) => {
        const zone = zoneFromTarget(e.target);
        if (zone && clickable) {
          onActivate(zone);
        }
      }}
      onKeyDown={(e) => {
        const zone = zoneFromTarget(e.target);
        if (zone && clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onActivate(zone);
        }
      }}
    />
  );
}
