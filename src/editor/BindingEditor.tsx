import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Alert, Button, Combobox, Stack, useStyles2 } from '@grafana/ui';
import { collectReadings } from '../data/readings';
import { DEFAULT_LABEL_ATTRIBUTE, DEFAULT_ZONE_TAG } from '../plan/marking';
import { preparePlan } from '../plan/preparePlan';
import { FloorMapOptions, ZoneBindings } from '../types';
import { bindByMatchingNames, pruneBindings, sensorOptions, setBinding, sortedSensors } from './bindings';

type Props = StandardEditorProps<ZoneBindings, unknown, FloorMapOptions>;

const getStyles = (theme: GrafanaTheme2) => ({
  row: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(80px, 35%) 1fr',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  }),
  zone: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  hint: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
});

export function BindingEditor({ value, onChange, context }: Props) {
  const styles = useStyles2(getStyles);
  const bindings = useMemo(() => value ?? {}, [value]);
  const options = context.options;
  const markup = options?.planMarkup ?? '';
  const labelAttribute = options?.labelAttribute || DEFAULT_LABEL_ATTRIBUTE;
  const zoneTag = options?.zoneTag || DEFAULT_ZONE_TAG;

  const plan = useMemo(() => preparePlan(markup, { labelAttribute, zoneTag }), [markup, labelAttribute, zoneTag]);
  const sensors = useMemo(
    () => sortedSensors(collectReadings(context.data ?? [], options?.fields)),
    [context.data, options?.fields]
  );

  if (plan.kind === 'empty') {
    return <div className={styles.hint}>Add a floor plan first.</div>;
  }
  if (plan.kind === 'error') {
    return <div className={styles.hint}>Fix the floor plan first: {plan.message}</div>;
  }
  if (plan.zones.length === 0) {
    return (
      <div className={styles.hint}>
        No zones found in the plan. Label each room shape &quot;Name [{zoneTag}]&quot; in Inkscape, or add a data-
        {zoneTag}=&quot;Name&quot; attribute.
      </div>
    );
  }

  const zones = plan.zones.map((z) => z.name);
  const orphaned = Object.keys(bindings).filter((zone) => !zones.includes(zone));

  return (
    <div data-testid="cfm-binding-editor">
      {sensors.length === 0 && (
        <div className={styles.hint}>No sensors in the data. Run a query that returns sensor readings.</div>
      )}
      {plan.duplicates.length > 0 && (
        <Alert severity="warning" title="Zone names used by more than one shape">
          {plan.duplicates.join(', ')}. All shapes with the same name share one sensor.
        </Alert>
      )}
      {plan.zones.map((zone) => {
        const current = bindings[zone.name];
        return (
          <div key={zone.name} className={styles.row}>
            <span className={styles.zone} title={zone.name}>
              {zone.name}
            </span>
            <Combobox<string>
              aria-label={`Sensor for ${zone.name}`}
              placeholder="No sensor"
              options={sensorOptions(sensors, current)}
              value={current ?? null}
              isClearable
              onChange={(option) => onChange(setBinding(bindings, zone.name, option?.value ?? null))}
            />
          </div>
        );
      })}
      <Stack gap={1} wrap="wrap">
        <Button
          size="sm"
          variant="secondary"
          icon="link"
          disabled={sensors.length === 0}
          onClick={() => onChange(bindByMatchingNames(bindings, zones, sensors))}
          tooltip="Binds each unbound zone to the sensor whose label equals the zone name"
        >
          Bind by matching names
        </Button>
        {orphaned.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon="trash-alt"
            onClick={() => onChange(pruneBindings(bindings, zones))}
          >
            Remove {orphaned.length} binding{orphaned.length > 1 ? 's' : ''} for missing zones
          </Button>
        )}
      </Stack>
    </div>
  );
}
