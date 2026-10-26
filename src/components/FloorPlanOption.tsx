import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Button, Collapse, Modal, Stack, TextArea, useStyles2 } from '@grafana/ui';
import { ClimateFloorOptions } from '../types';
import { readingsFromFrames } from '../data/readings';
import { listRooms, sanitizeFloorPlan } from '../svg/floorPlan';
import { addRoomsAsGrid, parsePlan, PlanModel, serializePlan } from '../editor/model';
import { FloorPlanEditor } from '../editor/FloorPlanEditor';

type Props = StandardEditorProps<string, unknown, ClimateFloorOptions>;

/** Distinct location (or sensor id) names in the query result, used to generate rooms. */
export function useDataRooms(context: Props['context']): string[] {
  const options = context.options;
  return useMemo(() => {
    const { readings } = readingsFromFrames(context.data ?? [], {
      sensor: options?.sensorField,
      location: options?.locationField,
    });
    return Array.from(new Set(readings.map((r) => (r.location ?? r.sensor).trim()).filter(Boolean)));
  }, [context.data, options?.sensorField, options?.locationField]);
}

export const FloorPlanOption: React.FC<Props> = ({ value, onChange, context }) => {
  const styles = useStyles2(getStyles);
  const markup = value ?? '';
  const dataRooms = useDataRooms(context);
  const [editing, setEditing] = useState<PlanModel>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [draft, setDraft] = useState<string>();

  const preview = useMemo(() => sanitizeFloorPlan(markup), [markup]);
  const roomCount = useMemo(() => listRooms(markup).length, [markup]);

  const openEditor = (generate = false) => {
    const plan = parsePlan(markup);
    setEditing(generate ? addRoomsAsGrid(plan, dataRooms) : plan);
  };

  return (
    <div className={styles.wrapper}>
      {preview ? (
        <button type="button" className={styles.preview} onClick={() => openEditor()} aria-label="Edit floor plan">
          <div dangerouslySetInnerHTML={{ __html: preview }} />
        </button>
      ) : (
        <div className={styles.empty}>No floor plan yet.</div>
      )}
      <div className={styles.meta}>
        {roomCount} room{roomCount === 1 ? '' : 's'}
        {dataRooms.length > 0 && ` · ${dataRooms.length} sensor location${dataRooms.length === 1 ? '' : 's'} in data`}
      </div>
      <Stack gap={1} wrap="wrap">
        <Button icon="pen" onClick={() => openEditor()} data-testid="floor-plan-open-editor">
          Edit floor plan
        </Button>
        <Button
          icon="table"
          variant="secondary"
          disabled={dataRooms.length === 0}
          tooltip={
            dataRooms.length
              ? 'Create one room per sensor location in the query result, then arrange them in the editor'
              : 'Run a query that returns sensors first'
          }
          onClick={() => openEditor(true)}
        >
          Generate from data
        </Button>
      </Stack>

      <Collapse label="SVG source" isOpen={sourceOpen} onToggle={() => setSourceOpen(!sourceOpen)}>
        <TextArea
          rows={8}
          value={draft ?? markup}
          className={styles.source}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => {
            if (draft !== undefined && draft !== markup) {
              onChange(draft);
            }
            setDraft(undefined);
          }}
        />
      </Collapse>

      {editing && (
        <Modal
          title="Floor plan editor"
          isOpen
          onDismiss={() => setEditing(undefined)}
          className={styles.modal}
          closeOnEscape={false}
        >
          <FloorPlanEditor
            initial={editing}
            dataRooms={dataRooms}
            onCancel={() => setEditing(undefined)}
            onSave={(plan) => {
              onChange(serializePlan(plan));
              setEditing(undefined);
            }}
          />
        </Modal>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  }),
  preview: css({
    padding: theme.spacing(1),
    background: theme.colors.background.canvas,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    cursor: 'pointer',
    '&:hover': { borderColor: theme.colors.border.strong },
    '& svg': { display: 'block', width: '100%', height: 'auto', maxHeight: 180 },
  }),
  empty: css({
    padding: theme.spacing(2),
    textAlign: 'center',
    color: theme.colors.text.secondary,
    border: `1px dashed ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
  }),
  meta: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  source: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  modal: css({
    width: 'min(1400px, 95vw)',
  }),
});
