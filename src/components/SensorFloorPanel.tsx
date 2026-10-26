import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps, rangeUtil } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { useStyles2, useTheme2 } from '@grafana/ui';
import { SensorFloorOptions, RoomState } from '../types';
import { parseMetricList, readingsFromFrames } from '../data/readings';
import { Formatter, metricFormatter } from '../data/format';
import { evaluateRoom } from '../data/rooms';
import { ColorLookup, roomColor } from '../data/colors';
import { collectRooms, ROOM_ATTR, sanitizeFloorPlan, scopeIds } from '../svg/floorPlan';
import { RoomTooltip } from './RoomTooltip';
import { Legend, LEGEND_HEIGHT } from './Legend';

interface Props extends PanelProps<SensorFloorOptions> {}

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABELS_ATTR = 'data-sfm-labels';

export function parseStaleAfter(value: string): number {
  if (!value?.trim()) {
    return 0;
  }
  try {
    return rangeUtil.intervalToMs(value.trim());
  } catch {
    return 0;
  }
}

/** Expands the link template with dashboard variables plus the clicked room's own values. */
export function buildRoomLink(template: string, state: RoomState, replaceVariables: Props['replaceVariables']): string {
  const vars = {
    room: state.room,
    sensor: state.reading?.sensor ?? '',
    location: state.reading?.location ?? state.room,
  };
  const scoped = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, { text: v, value: encodeURIComponent(v) }])
  );
  return replaceVariables(template, scoped);
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Only http(s) and relative links may be opened. The browser's URL parser decides, so spellings
 * such as "java\tscript:" are caught, and a dashboard variable cannot turn the link into one.
 */
export function isSafeLink(url: string, base = document.baseURI): boolean {
  if (!url.trim()) {
    return false;
  }
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url, base).protocol);
  } catch {
    return false;
  }
}

const openLink = (url: string, newTab: boolean) => {
  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else if (url.startsWith('/') && !url.startsWith('//')) {
    locationService.push(url);
  } else {
    // Follows the link in this tab the way a click on it would.
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    a.click();
  }
};

export const SensorFloorPanel: React.FC<Props> = ({
  id,
  options,
  data,
  width,
  height,
  timeZone,
  replaceVariables,
}) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  // DOM nodes live in a ref (they are mutated when painting); state only tracks the names, to re-render.
  const roomEls = useRef<Map<string, Element>>(new Map());
  const [roomNames, setRoomNames] = useState<string[]>([]);
  const [hover, setHover] = useState<{ room: string; x: number; y: number }>();

  const markup = useMemo(() => sanitizeFloorPlan(options.floorPlan ?? ''), [options.floorPlan]);

  // Mount the plan only when the markup changes, so colour updates do not rebuild the DOM.
  useLayoutEffect(() => {
    const host = planRef.current;
    if (!host) {
      return;
    }
    host.innerHTML = markup;
    const svg = host.querySelector('svg');
    if (svg) {
      // Let the plan scale to the panel, and keep browser tooltips from competing with ours.
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.querySelectorAll('title').forEach((t) => t.remove());
    }
    roomEls.current = collectRooms(host);
    // After collecting rooms, since a room can be named by its id.
    scopeIds(host, `sfm-${id}-`);
    setRoomNames(Array.from(roomEls.current.keys()));
  }, [markup, id]);

  const { readings, metrics } = useMemo(
    () =>
      readingsFromFrames(
        data.series,
        { sensor: options.sensorField, location: options.locationField },
        parseMetricList(options.metrics)
      ),
    [data.series, options.sensorField, options.locationField, options.metrics]
  );

  const formatters = useMemo(
    () => new Map<string, Formatter>(metrics.map((m) => [m.key, metricFormatter(m, theme)])),
    [metrics, theme]
  );

  const now = data.timeRange.to.valueOf();
  const states = useMemo(() => {
    const opts = {
      bindings: options.bindings ?? {},
      autoBind: options.autoBind,
      metrics,
      warningMargin: options.warningMargin,
      now,
      staleAfterMs: parseStaleAfter(options.staleAfter),
    };
    return new Map(roomNames.map((room) => [room, evaluateRoom(room, readings, opts)]));
  }, [
    roomNames,
    readings,
    metrics,
    now,
    options.bindings,
    options.autoBind,
    options.warningMargin,
    options.staleAfter,
  ]);

  const lookup: ColorLookup = useCallback(
    (name) => (name === 'text-disabled' ? theme.colors.text.disabled : theme.visualization.getColorByName(name)),
    [theme]
  );

  const clickable = Boolean(options.linkUrl?.trim());

  // Paint rooms and redraw the in-room labels.
  useLayoutEffect(() => {
    const svg = planRef.current?.querySelector('svg');
    if (!svg) {
      return;
    }
    svg.querySelector(`[${LABELS_ATTR}]`)?.remove();
    const labels = document.createElementNS(SVG_NS, 'g');
    labels.setAttribute(LABELS_ATTR, '');
    labels.setAttribute('pointer-events', 'none');

    for (const [room, state] of states) {
      const shape = roomEls.current.get(room) as SVGGraphicsElement | undefined;
      if (!shape) {
        continue;
      }
      const color = roomColor(state, options.colorBy, lookup);
      shape.style.fill = color ?? '';
      shape.style.fillOpacity = color ? (state.status === 'offline' ? '0.35' : '0.75') : '';
      shape.style.transition = 'fill 1.2s ease, fill-opacity 1.2s ease';
      shape.style.cursor = clickable && state.status !== 'unbound' ? 'pointer' : '';
      shape.setAttribute('data-status', state.status);
      if (clickable && state.status !== 'unbound') {
        shape.setAttribute('tabindex', '0');
        shape.setAttribute('role', 'link');
        shape.setAttribute('aria-label', `Open details for ${room}`);
      } else {
        shape.removeAttribute('tabindex');
        shape.removeAttribute('role');
        shape.removeAttribute('aria-label');
      }

      // getBBox is missing outside a real layout engine (jsdom), so labels are best-effort.
      const box = typeof shape.getBBox === 'function' ? shape.getBBox() : undefined;
      if (!box || box.width === 0 || box.height === 0) {
        continue;
      }
      const lines = [room];
      if (options.showValues) {
        if (state.status === 'offline') {
          lines.push('Offline');
        } else {
          // One value per line; beyond three, rooms get too crowded to read. The tooltip has the rest.
          for (const m of state.metrics.slice(0, 3)) {
            lines.push(formatters.get(m.key)?.(m.value) ?? String(m.value));
          }
        }
      }
      // Fit the longest line across the room (about 0.6 em per character) and every line down it.
      const longest = Math.max(...lines.map((l) => l.length));
      const fontSize = Math.max(
        7,
        Math.min(20, (box.width * 0.9) / (longest * 0.6), (box.height * 0.85) / (lines.length * 1.25))
      );
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(box.x + box.width / 2));
      text.setAttribute('y', String(box.y + box.height / 2 - ((lines.length - 1) * fontSize * 1.15) / 2));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', String(fontSize));
      text.setAttribute('font-family', theme.typography.fontFamily);
      text.setAttribute('fill', theme.colors.text.primary);
      text.setAttribute('stroke', theme.colors.background.primary);
      text.setAttribute('stroke-width', String(fontSize / 5));
      text.setAttribute('paint-order', 'stroke');
      lines.forEach((line, i) => {
        const span = document.createElementNS(SVG_NS, 'tspan');
        span.setAttribute('x', String(box.x + box.width / 2));
        span.setAttribute('dy', i === 0 ? '0' : '1.15em');
        if (i === 0) {
          span.setAttribute('font-weight', String(theme.typography.fontWeightMedium));
        }
        span.textContent = line;
        text.appendChild(span);
      });
      labels.appendChild(text);
    }
    svg.appendChild(labels);
  }, [states, options.colorBy, options.showValues, formatters, lookup, clickable, theme]);

  const roomAt = (target: EventTarget | null) =>
    target instanceof Element ? (target.closest(`[${ROOM_ATTR}]`)?.getAttribute(ROOM_ATTR) ?? undefined) : undefined;

  const onMouseMove = (e: React.MouseEvent) => {
    const room = roomAt(e.target);
    const rect = wrapperRef.current?.getBoundingClientRect();
    setHover(room && rect ? { room, x: e.clientX - rect.left, y: e.clientY - rect.top } : undefined);
  };

  const activate = (room: string | undefined) => {
    const state = room ? states.get(room) : undefined;
    if (!clickable || !state || state.status === 'unbound') {
      return;
    }
    const url = buildRoomLink(options.linkUrl, state, replaceVariables).trim();
    if (isSafeLink(url)) {
      openLink(url, options.linkNewTab);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const room = roomAt(e.target);
      if (room) {
        e.preventDefault();
        activate(room);
      }
    }
  };

  const planHeight = options.showLegend ? Math.max(0, height - LEGEND_HEIGHT) : height;
  const hovered = hover ? states.get(hover.room) : undefined;

  if (!markup.trim()) {
    return (
      <div className={styles.message}>
        No plan yet. Draw one or paste SVG markup under Plan drawing in the panel options.
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper} style={{ width, height }}>
      <div
        ref={planRef}
        className={styles.plan}
        style={{ height: planHeight }}
        data-testid="sensor-floor-plan"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(undefined)}
        onClick={(e) => activate(roomAt(e.target))}
        onKeyDown={onKeyDown}
      />
      {roomNames.length === 0 && (
        <div className={styles.overlay}>
          No rooms found. Give room shapes a <code>data-room=&quot;Name&quot;</code> attribute or an id like{' '}
          <code>room-Name</code>.
        </div>
      )}
      {options.showLegend && <Legend colorBy={options.colorBy} metrics={metrics} lookup={lookup} states={states} />}
      {hover && hovered && (
        <RoomTooltip
          state={hovered}
          x={hover.x}
          y={hover.y}
          containerWidth={width}
          containerHeight={height}
          metrics={metrics}
          formatters={formatters}
          timeZone={timeZone}
        />
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }),
  plan: css({
    width: '100%',
    flex: '0 0 auto',
    '& > svg': {
      width: '100%',
      height: '100%',
      display: 'block',
    },
    [`& [${ROOM_ATTR}]:focus-visible`]: {
      outline: 'none',
      stroke: theme.colors.primary.main,
      strokeWidth: 4,
    },
  }),
  overlay: css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: theme.spacing(2),
    color: theme.colors.text.secondary,
    pointerEvents: 'none',
  }),
  message: css({
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    color: theme.colors.text.secondary,
  }),
});
