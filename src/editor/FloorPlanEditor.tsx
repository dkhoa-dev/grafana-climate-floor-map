import React, { useId, useMemo, useRef, useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import {
  Button,
  ConfirmButton,
  Field,
  IconButton,
  Input,
  RadioButtonGroup,
  Stack,
  Switch,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import {
  addRoomsAsGrid,
  newId,
  PlanModel,
  Point,
  rectFromCorners,
  Shape,
  shapeBounds,
  snap,
  translateShape,
  uniqueName,
} from './model';
import { AiAssistant } from '../ai/AiAssistant';

type Tool = 'select' | 'rect' | 'polygon';

interface Props {
  initial: PlanModel;
  /** Room names found in the query result, offered by "Add rooms from data". */
  dataRooms: string[];
  onSave: (plan: PlanModel) => void;
  onCancel: () => void;
}

type Drag =
  | { kind: 'move'; id: string; start: Point; origin: Shape; before: PlanModel }
  | { kind: 'corner'; id: string; anchor: Point; before: PlanModel }
  | { kind: 'vertex'; id: string; index: number; before: PlanModel }
  | { kind: 'draw'; start: Point; current: Point };

const TOOLS: Array<{ value: Tool; label: string; icon: 'arrow-up' | 'square-shape' | 'gf-grid'; description: string }> =
  [
    { value: 'select', label: 'Select', icon: 'arrow-up', description: 'Move rooms, drag corners and vertices (V)' },
    { value: 'rect', label: 'Rectangle', icon: 'square-shape', description: 'Drag to draw a rectangular room (R)' },
    {
      value: 'polygon',
      label: 'Polygon',
      icon: 'gf-grid',
      description: 'Click corners; click the first one or press Enter to finish (P)',
    },
  ];

const MAX_HISTORY = 100;

const centre = (s: Shape): Point => {
  const b = shapeBounds(s);
  return [b.x + b.width / 2, b.y + b.height / 2];
};

const corners = (s: Shape): Point[] => {
  const b = shapeBounds(s);
  return [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.height],
    [b.x, b.y + b.height],
  ];
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

export const FloorPlanEditor: React.FC<Props> = ({ initial, dataRooms, onSave, onCancel }) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const gridId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);

  const [plan, setPlan] = useState<PlanModel>(initial);
  const [history, setHistory] = useState<PlanModel[]>([]);
  const [selected, setSelected] = useState<string>();
  const [tool, setTool] = useState<Tool>('select');
  const [grid, setGrid] = useState(10);
  const [snapOn, setSnapOn] = useState(true);
  const [drag, setDrag] = useState<Drag>();
  const [polygon, setPolygon] = useState<Point[]>([]);
  const [pointer, setPointer] = useState<Point>();

  const scale = Math.max(plan.width, plan.height);
  const handle = scale / 120;
  const selectedShape = plan.shapes.find((s) => s.id === selected);
  const missing = useMemo(() => addRoomsAsGrid(plan, dataRooms).shapes.length - plan.shapes.length, [plan, dataRooms]);

  /** Records `before` in the undo history and applies `next`. */
  const commit = (next: PlanModel, before: PlanModel = plan) => {
    if (next === before) {
      return;
    }
    setHistory((h) => [...h.slice(-MAX_HISTORY + 1), before]);
    setPlan(next);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory(history.slice(0, -1));
      setPlan(prev);
      if (selected && !prev.shapes.some((s) => s.id === selected)) {
        setSelected(undefined);
      }
    }
  };

  const updateShape = (id: string, change: (s: Shape) => Shape, base: PlanModel = plan): PlanModel => ({
    ...base,
    shapes: base.shapes.map((s) => (s.id === id ? change(s) : s)),
  });

  const removeShape = (id: string) => {
    commit({ ...plan, shapes: plan.shapes.filter((s) => s.id !== id) });
    setSelected(undefined);
  };

  const duplicate = (shape: Shape) => {
    const copy = {
      ...translateShape(shape, grid * 2 || 20, grid * 2 || 20),
      id: newId(),
      name: uniqueName(
        shape.name,
        plan.shapes.map((s) => s.name)
      ),
    };
    commit({ ...plan, shapes: [...plan.shapes, copy] });
    setSelected(copy.id);
  };

  const toPlan = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm) {
      return [e.clientX, e.clientY];
    }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  const snapPoint = (p: Point, free: boolean): Point => (snapOn && !free ? [snap(p[0], grid), snap(p[1], grid)] : p);

  const finishPolygon = (points: Point[]) => {
    if (points.length >= 3) {
      const shape: Shape = {
        id: newId(),
        kind: 'polygon',
        name: uniqueName(
          'Room',
          plan.shapes.map((s) => s.name)
        ),
        points,
      };
      commit({ ...plan, shapes: [...plan.shapes, shape] });
      setSelected(shape.id);
    }
    setPolygon([]);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) {
      return;
    }
    const raw = toPlan(e);
    const p = snapPoint(raw, e.altKey);
    const target = e.target as Element;
    const shapeId = target.closest('[data-shape-id]')?.getAttribute('data-shape-id') ?? undefined;
    const cornerIndex = target.getAttribute('data-corner');
    const vertexIndex = target.getAttribute('data-vertex');
    svgRef.current?.setPointerCapture?.(e.pointerId);

    if (tool === 'rect') {
      setDrag({ kind: 'draw', start: p, current: p });
      return;
    }
    if (tool === 'polygon') {
      const first = polygon[0];
      if (first && polygon.length >= 3 && Math.hypot(first[0] - raw[0], first[1] - raw[1]) < handle * 2) {
        finishPolygon(polygon);
      } else {
        setPolygon([...polygon, p]);
      }
      return;
    }

    if (selectedShape && cornerIndex !== null) {
      const opposite = corners(selectedShape)[(Number(cornerIndex) + 2) % 4];
      setDrag({ kind: 'corner', id: selectedShape.id, anchor: opposite, before: plan });
      return;
    }
    if (selectedShape && vertexIndex !== null) {
      const index = Number(vertexIndex);
      if (e.shiftKey && selectedShape.kind === 'polygon' && selectedShape.points.length > 3) {
        commit(
          updateShape(selectedShape.id, (s) =>
            s.kind === 'polygon' ? { ...s, points: s.points.filter((_, i) => i !== index) } : s
          )
        );
        return;
      }
      setDrag({ kind: 'vertex', id: selectedShape.id, index, before: plan });
      return;
    }
    const shape = plan.shapes.find((s) => s.id === shapeId);
    if (shape) {
      setSelected(shape.id);
      setDrag({ kind: 'move', id: shape.id, start: raw, origin: shape, before: plan });
    } else {
      setSelected(undefined);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = toPlan(e);
    const p = snapPoint(raw, e.altKey);
    setPointer(p);
    if (!drag) {
      return;
    }
    switch (drag.kind) {
      case 'draw':
        setDrag({ ...drag, current: p });
        break;
      case 'move': {
        const free = !snapOn || e.altKey;
        const dx = free ? raw[0] - drag.start[0] : snap(raw[0] - drag.start[0], grid);
        const dy = free ? raw[1] - drag.start[1] : snap(raw[1] - drag.start[1], grid);
        setPlan(updateShape(drag.id, () => translateShape(drag.origin, dx, dy), drag.before));
        break;
      }
      case 'corner': {
        const r = rectFromCorners(drag.anchor, p);
        setPlan(
          updateShape(drag.id, (s) => {
            if (s.kind === 'rect') {
              return { ...s, ...r };
            }
            // Scale a polygon to the new box.
            const b = shapeBounds(s);
            const sx = b.width ? r.width / b.width : 1;
            const sy = b.height ? r.height / b.height : 1;
            return { ...s, points: s.points.map(([x, y]) => [r.x + (x - b.x) * sx, r.y + (y - b.y) * sy] as Point) };
          })
        );
        break;
      }
      case 'vertex':
        setPlan(
          updateShape(drag.id, (s) =>
            s.kind === 'polygon' ? { ...s, points: s.points.map((pt, i) => (i === drag.index ? p : pt)) } : s
          )
        );
        break;
    }
  };

  const onPointerUp = () => {
    if (!drag) {
      return;
    }
    if (drag.kind === 'draw') {
      const r = rectFromCorners(drag.start, drag.current);
      if (r.width > handle && r.height > handle) {
        const shape: Shape = {
          id: newId(),
          kind: 'rect',
          name: uniqueName(
            'Room',
            plan.shapes.map((s) => s.name)
          ),
          ...r,
        };
        commit({ ...plan, shapes: [...plan.shapes, shape] });
        setSelected(shape.id);
      }
    } else {
      commit(plan, drag.before);
    }
    setDrag(undefined);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'polygon') {
      // The double click's two pointer-downs already added the final point twice.
      finishPolygon(polygon.slice(0, -1));
      return;
    }
    // Double-click a polygon edge to add a vertex there.
    if (tool === 'select' && selectedShape?.kind === 'polygon') {
      const p = snapPoint(toPlan(e), e.altKey);
      const pts = selectedShape.points;
      let best = -1;
      let bestDist = handle * 3;
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len ** 2));
        const d = Math.hypot(a[0] + t * (b[0] - a[0]) - p[0], a[1] + t * (b[1] - a[1]) - p[1]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (best >= 0) {
        const points = [...pts.slice(0, best + 1), p, ...pts.slice(best + 1)];
        commit(updateShape(selectedShape.id, (s) => ({ ...s, points })));
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target)) {
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Escape') {
      if (polygon.length) {
        setPolygon([]);
      } else {
        setSelected(undefined);
      }
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && polygon.length) {
      finishPolygon(polygon);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
      e.preventDefault();
      removeShape(selectedShape.id);
    } else if (mod && e.key.toLowerCase() === 'd' && selectedShape) {
      e.preventDefault();
      duplicate(selectedShape);
    } else if (e.key.startsWith('Arrow') && selectedShape) {
      e.preventDefault();
      const step = e.shiftKey ? grid * 5 || 10 : grid || 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      commit(updateShape(selectedShape.id, (s) => translateShape(s, dx, dy)));
    } else if (!mod && ['v', 'r', 'p'].includes(e.key.toLowerCase())) {
      setTool(({ v: 'select', r: 'rect', p: 'polygon' } as const)[e.key.toLowerCase() as 'v' | 'r' | 'p']);
      setPolygon([]);
    }
  };

  const draftRect = drag?.kind === 'draw' ? rectFromCorners(drag.start, drag.current) : undefined;
  const pad = scale * 0.03;
  const fill = theme.visualization.getColorByName('green');
  const selectedColor = theme.colors.primary.main;
  const nameClash =
    selectedShape && plan.shapes.some((s) => s.id !== selectedShape.id && s.name.trim() === selectedShape.name.trim());

  return (
    <div className={styles.layout} onKeyDown={onKeyDown} tabIndex={-1} data-testid="floor-plan-editor">
      <div className={styles.canvasColumn}>
        <Stack gap={1} alignItems="center" wrap="wrap">
          <RadioButtonGroup<Tool>
            options={TOOLS}
            value={tool}
            onChange={(t) => {
              setTool(t);
              setPolygon([]);
            }}
          />
          <IconButton name="history-alt" tooltip="Undo (Ctrl+Z)" disabled={!history.length} onClick={undo} />
          <span className={styles.hint}>
            {tool === 'rect' && 'Drag to draw. Hold Alt to ignore the grid.'}
            {tool === 'polygon' &&
              (polygon.length
                ? 'Click to add corners. Click the first corner or press Enter to finish, Esc to cancel.'
                : 'Click to place the first corner.')}
            {tool === 'select' &&
              (selectedShape?.kind === 'polygon'
                ? 'Drag vertices to reshape. Double-click an edge to add one, Shift+click to remove one.'
                : 'Click a room to select it. Drag to move, corners to resize. Arrows nudge, Delete removes.')}
          </span>
        </Stack>
        <svg
          ref={svgRef}
          className={cx(styles.canvas, tool !== 'select' && styles.crosshair)}
          viewBox={`${plan.minX - pad} ${plan.minY - pad} ${plan.width + pad * 2} ${plan.height + pad * 2}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setPointer(undefined)}
          onDoubleClick={onDoubleClick}
          data-testid="floor-plan-canvas"
        >
          <defs>
            {grid > 0 && (
              <pattern id={gridId} width={grid} height={grid} patternUnits="userSpaceOnUse" x={plan.minX} y={plan.minY}>
                <path
                  d={`M ${grid} 0 L 0 0 0 ${grid}`}
                  fill="none"
                  stroke={theme.colors.border.weak}
                  strokeWidth={scale / 1500}
                />
              </pattern>
            )}
          </defs>
          <rect
            x={plan.minX}
            y={plan.minY}
            width={plan.width}
            height={plan.height}
            fill={grid > 0 ? `url(#${gridId})` : 'none'}
            stroke={theme.colors.border.medium}
            strokeWidth={scale / 600}
          />
          {plan.staticMarkup && <g className={styles.static} dangerouslySetInnerHTML={{ __html: plan.staticMarkup }} />}
          {plan.shapes.map((s) => {
            const isSel = s.id === selected;
            const common = {
              'data-shape-id': s.id,
              fill,
              fillOpacity: isSel ? 0.45 : 0.25,
              stroke: isSel ? selectedColor : theme.colors.text.secondary,
              strokeWidth: (isSel ? 3 : 2) * (scale / 800),
              className: tool === 'select' ? styles.movable : undefined,
            };
            const [cx0, cy0] = centre(s);
            const b = shapeBounds(s);
            return (
              <g key={s.id}>
                {s.kind === 'rect' ? (
                  <rect {...common} x={s.x} y={s.y} width={s.width} height={s.height} />
                ) : (
                  <polygon {...common} points={s.points.map((p) => p.join(',')).join(' ')} />
                )}
                <text
                  x={cx0}
                  y={cy0}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.max(scale / 80, Math.min(scale / 40, b.width / 8))}
                  fill={theme.colors.text.primary}
                  pointerEvents="none"
                >
                  {s.name}
                </text>
              </g>
            );
          })}
          {selectedShape &&
            tool === 'select' &&
            corners(selectedShape).map(([x, y], i) => (
              <rect
                key={`c${i}`}
                data-corner={i}
                x={x - handle}
                y={y - handle}
                width={handle * 2}
                height={handle * 2}
                fill={theme.colors.background.primary}
                stroke={selectedColor}
                strokeWidth={scale / 800}
                className={i % 2 === 0 ? styles.resizeNwse : styles.resizeNesw}
              />
            ))}
          {selectedShape?.kind === 'polygon' &&
            tool === 'select' &&
            selectedShape.points.map(([x, y], i) => (
              <circle
                key={`v${i}`}
                data-vertex={i}
                cx={x}
                cy={y}
                r={handle}
                fill={selectedColor}
                className={styles.movable}
              />
            ))}
          {draftRect && (
            <rect
              {...draftRect}
              fill={fill}
              fillOpacity={0.2}
              stroke={selectedColor}
              strokeDasharray={`${handle} ${handle}`}
              strokeWidth={scale / 800}
            />
          )}
          {polygon.length > 0 && (
            <>
              <polyline
                points={[...polygon, ...(pointer ? [pointer] : [])].map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke={selectedColor}
                strokeWidth={scale / 800}
                strokeDasharray={`${handle} ${handle}`}
              />
              {polygon.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={i === 0 ? handle * 1.4 : handle * 0.8} fill={selectedColor} />
              ))}
            </>
          )}
        </svg>
        <div className={styles.footer}>
          {pointer ? `x ${Math.round(pointer[0])}, y ${Math.round(pointer[1])}` : ' '}
        </div>
      </div>

      <div className={styles.sidebar}>
        {selectedShape ? (
          <div className={styles.section}>
            <Field label="Room name" invalid={nameClash} error={nameClash ? 'Another room has this name' : undefined}>
              <Input
                value={selectedShape.name}
                autoFocus
                data-testid="floor-plan-room-name"
                onChange={(e) => {
                  const name = e.currentTarget.value;
                  setPlan(updateShape(selectedShape.id, (s) => ({ ...s, name })));
                }}
                onFocus={() => setHistory((h) => [...h, plan])}
              />
            </Field>
            <Stack gap={1}>
              <Button size="sm" variant="secondary" icon="copy" onClick={() => duplicate(selectedShape)}>
                Duplicate
              </Button>
              <Button size="sm" variant="destructive" icon="trash-alt" onClick={() => removeShape(selectedShape.id)}>
                Delete
              </Button>
            </Stack>
          </div>
        ) : (
          <div className={cx(styles.section, styles.hint)}>Select a room to rename or delete it.</div>
        )}

        <div className={styles.section}>
          <Button
            icon="table"
            variant={plan.shapes.length ? 'secondary' : 'primary'}
            disabled={missing === 0}
            onClick={() => commit(addRoomsAsGrid(plan, dataRooms))}
            tooltip={
              dataRooms.length
                ? 'One room per sensor location in the query result, laid out as a grid you can then rearrange'
                : 'Run a query that returns sensors first'
            }
            fullWidth
          >
            {missing > 0
              ? `Add ${missing} room${missing === 1 ? '' : 's'} from data`
              : 'All data rooms are on the plan'}
          </Button>
        </div>

        <div className={styles.section}>
          <div className={styles.heading}>AI assistant</div>
          <AiAssistant
            plan={plan}
            dataRooms={dataRooms}
            onResult={(next) => {
              commit(next);
              setSelected(undefined);
              setTool('select');
            }}
          />
        </div>

        <div className={styles.section}>
          <div className={styles.heading}>Rooms ({plan.shapes.length})</div>
          <div className={styles.roomList}>
            {plan.shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cx(styles.roomItem, s.id === selected && styles.roomItemSelected)}
                onClick={() => {
                  setTool('select');
                  setSelected(s.id);
                }}
              >
                {s.name || '(unnamed)'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.heading}>Canvas</div>
          <Stack gap={1}>
            <Field label="Width">
              <Input
                type="number"
                min={50}
                value={plan.width}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (v > 0) {
                    setPlan({ ...plan, width: v });
                  }
                }}
              />
            </Field>
            <Field label="Height">
              <Input
                type="number"
                min={50}
                value={plan.height}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (v > 0) {
                    setPlan({ ...plan, height: v });
                  }
                }}
              />
            </Field>
          </Stack>
          <Stack gap={1} alignItems="center">
            <Field label="Grid">
              <Input
                type="number"
                min={0}
                value={grid}
                width={10}
                onChange={(e) => setGrid(Math.max(0, Number(e.currentTarget.value) || 0))}
              />
            </Field>
            <Field label="Snap">
              <Switch value={snapOn} onChange={() => setSnapOn(!snapOn)} />
            </Field>
          </Stack>
          {plan.staticMarkup && (
            <ConfirmButton
              confirmText="Remove"
              confirmVariant="destructive"
              onConfirm={() => commit({ ...plan, staticMarkup: '' })}
            >
              <Button size="sm" variant="secondary" fill="text" icon="eye-slash">
                Remove background drawing
              </Button>
            </ConfirmButton>
          )}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(plan)} data-testid="floor-plan-save">
            Save plan
          </Button>
        </div>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  layout: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 260px',
    gap: theme.spacing(2),
    height: '70vh',
    outline: 'none',
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: '1fr',
      height: 'auto',
    },
  }),
  canvasColumn: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minHeight: 0,
  }),
  canvas: css({
    flex: 1,
    width: '100%',
    minHeight: 300,
    background: theme.colors.background.canvas,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    touchAction: 'none',
    userSelect: 'none',
  }),
  crosshair: css({ cursor: 'crosshair' }),
  movable: css({ cursor: 'move' }),
  resizeNwse: css({ cursor: 'nwse-resize' }),
  resizeNesw: css({ cursor: 'nesw-resize' }),
  static: css({ opacity: 0.6, pointerEvents: 'none' }),
  footer: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    fontVariantNumeric: 'tabular-nums',
  }),
  hint: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  sidebar: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    overflowY: 'auto',
    minHeight: 0,
  }),
  section: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  }),
  heading: css({
    fontWeight: theme.typography.fontWeightMedium,
  }),
  roomList: css({
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 200,
    overflowY: 'auto',
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
  }),
  roomItem: css({
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: theme.colors.text.primary,
    padding: theme.spacing(0.5, 1),
    cursor: 'pointer',
    '&:hover': { background: theme.colors.action.hover },
  }),
  roomItemSelected: css({
    background: theme.colors.action.selected,
  }),
  actions: css({
    marginTop: 'auto',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
  }),
});
