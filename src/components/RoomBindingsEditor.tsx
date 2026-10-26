import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Combobox, ComboboxOption, useStyles2 } from '@grafana/ui';
import { SensorFloorOptions } from '../types';
import { readingsFromFrames } from '../data/readings';
import { findReading } from '../data/rooms';
import { listRooms } from '../svg/floorPlan';

type Props = StandardEditorProps<Record<string, string>, unknown, SensorFloorOptions>;

export const RoomBindingsEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const styles = useStyles2(getStyles);
  const options = context.options;
  const bindings = useMemo(() => value ?? {}, [value]);

  const rooms = useMemo(() => listRooms(options?.floorPlan ?? ''), [options?.floorPlan]);
  const readings = useMemo(
    () =>
      readingsFromFrames(context.data ?? [], {
        sensor: options?.sensorField,
        location: options?.locationField,
      }).readings,
    [context.data, options?.sensorField, options?.locationField]
  );

  // Sorted by label so the list does not reshuffle as new readings arrive.
  const sensorOptions: Array<ComboboxOption<string>> = useMemo(
    () =>
      readings
        .map((r) => ({
          value: r.sensor,
          label: r.location && r.location !== r.sensor ? `${r.location} (${r.sensor})` : r.sensor,
        }))
        .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value)),
    [readings]
  );

  if (rooms.length === 0) {
    return <div className={styles.hint}>No rooms in the floor plan yet.</div>;
  }

  const setBinding = (room: string, sensor: string | undefined) => {
    // Panel options are merged, so a removed key has to be set to undefined explicitly.
    onChange({ ...bindings, [room]: sensor || (undefined as unknown as string) });
  };

  return (
    <div className={styles.table}>
      <div className={styles.header}>Room</div>
      <div className={styles.header}>Sensor</div>
      {rooms.map((room) => {
        const bound = bindings[room];
        const auto = !bound && options?.autoBind ? findReading(room, readings, bindings, true) : undefined;
        const known = !bound || sensorOptions.some((o) => o.value === bound);
        const roomOptions = known ? sensorOptions : [{ value: bound, label: `${bound} (no data)` }, ...sensorOptions];
        return (
          <React.Fragment key={room}>
            <div className={styles.room} title={room}>
              {room}
            </div>
            <Combobox<string>
              options={roomOptions}
              value={bound ?? null}
              isClearable
              placeholder={
                auto ? `Auto: ${auto.location ?? auto.sensor}` : options?.autoBind ? 'Auto: no match' : 'None'
              }
              onChange={(v) => setBinding(room, v?.value)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  table: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(80px, 1fr) 2fr',
    gap: theme.spacing(0.5, 1),
    alignItems: 'center',
  }),
  header: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  room: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  hint: css({
    color: theme.colors.text.secondary,
  }),
});
