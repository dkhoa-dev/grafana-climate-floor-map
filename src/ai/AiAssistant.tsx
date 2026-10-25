import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, Button, Checkbox, Field, IconButton, Input, Stack, TextArea, useStyles2 } from '@grafana/ui';
import { PlanModel, serializePlan } from '../editor/model';
import { ACCEPTED_FILES, readAttachment } from './attachments';
import type { Attachment } from './generatePlan';

// The Anthropic SDK is large, so it is only fetched when someone actually generates a plan.
const loadAi = () => import(/* webpackChunkName: "ai" */ './generatePlan');

const KEY_STORAGE = 'climate-floor-map.anthropic-api-key';

const FIX_FORMAT =
  'Convert the current plan to the output format. Keep every room, its name and its geometry; only fix the markup.';

const loadKey = () => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
};

const storeKey = (key: string | undefined) => {
  try {
    if (key) {
      localStorage.setItem(KEY_STORAGE, key);
    } else {
      localStorage.removeItem(KEY_STORAGE);
    }
  } catch {
    // Storage can be unavailable (private mode); the key then lasts for this editor session only.
  }
};

interface Props {
  plan: PlanModel;
  dataRooms: string[];
  onResult: (plan: PlanModel) => void;
}

export const AiAssistant: React.FC<Props> = ({ plan, dataRooms, onResult }) => {
  const styles = useStyles2(getStyles);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const hasPlan = plan.shapes.length > 0 || plan.staticMarkup.trim() !== '';

  const [apiKey, setApiKey] = useState(loadKey);
  const [remember, setRemember] = useState(() => loadKey() !== '');
  const [editingKey, setEditingKey] = useState(() => loadKey() === '');
  const [instruction, setInstruction] = useState('');
  const [attachment, setAttachment] = useState<Attachment>();
  const [useCurrent, setUseCurrent] = useState(hasPlan);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [notes, setNotes] = useState<string>();

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (text: string, fromCurrent: boolean) => {
    if (!apiKey.trim()) {
      setEditingKey(true);
      setError('Enter an Anthropic API key first.');
      return;
    }
    storeKey(remember ? apiKey.trim() : undefined);
    setEditingKey(false);
    setBusy(true);
    setProgress(0);
    setError(undefined);
    setNotes(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    let ai: Awaited<ReturnType<typeof loadAi>> | undefined;
    try {
      ai = await loadAi();
      const result = await ai.generatePlan({
        apiKey: apiKey.trim(),
        instruction: text,
        currentSvg: fromCurrent && hasPlan ? serializePlan(plan) : undefined,
        attachment,
        dataRooms,
        signal: controller.signal,
        onProgress: setProgress,
      });
      onResult(result.plan);
      setNotes(result.notes || undefined);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(ai ? ai.describeError(e) : `Could not load the AI module: ${e instanceof Error ? e.message : e}`);
      }
    } finally {
      setBusy(false);
      abortRef.current = undefined;
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      setAttachment(await readAttachment(file));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const canGenerate = !busy && (instruction.trim() !== '' || attachment !== undefined || (useCurrent && hasPlan));

  return (
    <div className={styles.box} data-testid="floor-plan-ai">
      {editingKey ? (
        <Field
          label="Anthropic API key"
          description="Sent only from this browser to api.anthropic.com. Never saved in the dashboard."
        >
          <Stack direction="column" gap={0.5}>
            <Input
              type="password"
              value={apiKey}
              placeholder="sk-ant-…"
              autoComplete="off"
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
            <Checkbox
              label="Remember in this browser"
              value={remember}
              onChange={(e) => {
                setRemember(e.currentTarget.checked);
                if (!e.currentTarget.checked) {
                  storeKey(undefined);
                }
              }}
            />
          </Stack>
        </Field>
      ) : (
        <div className={styles.keyRow}>
          <span>API key set{remember ? ' (remembered in this browser)' : ''}</span>
          <Button size="sm" variant="secondary" fill="text" onClick={() => setEditingKey(true)}>
            Change
          </Button>
        </div>
      )}

      <TextArea
        rows={4}
        value={instruction}
        placeholder={
          attachment
            ? 'Optional notes, e.g. "ignore the car park; the unlabelled room top right is the server room"'
            : 'Describe the floor, e.g. "Open office on the left, three meeting rooms along the top, server room by the stairs, lab on the right"'
        }
        onChange={(e) => setInstruction(e.currentTarget.value)}
        disabled={busy}
      />

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_FILES}
        hidden
        onChange={(e) => {
          onFile(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      {attachment ? (
        <div className={styles.attachment}>
          <span title={attachment.name}>{attachment.name}</span>
          <IconButton name="times" tooltip="Remove" onClick={() => setAttachment(undefined)} disabled={busy} />
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon="upload" onClick={() => fileRef.current?.click()} disabled={busy}>
          Trace an image or PDF
        </Button>
      )}

      <Checkbox
        label="Start from the current plan"
        value={useCurrent && hasPlan}
        disabled={!hasPlan || busy}
        onChange={(e) => setUseCurrent(e.currentTarget.checked)}
      />

      {busy ? (
        <Stack gap={1} alignItems="center">
          <Button icon="spinner" disabled fullWidth>
            {progress ? `Drawing… ${progress.toLocaleString()} chars` : 'Thinking…'}
          </Button>
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        </Stack>
      ) : (
        <Stack gap={1}>
          <Button icon="ai" disabled={!canGenerate} onClick={() => run(instruction, useCurrent)} fullWidth>
            Generate
          </Button>
          <Button
            variant="secondary"
            disabled={!hasPlan}
            tooltip="Rewrite the current plan into the format the panel expects, keeping rooms and shapes"
            onClick={() => run(FIX_FORMAT, true)}
          >
            Fix format
          </Button>
        </Stack>
      )}

      {error && (
        <Alert severity="error" title="" onRemove={() => setError(undefined)}>
          {error}
        </Alert>
      )}
      {notes && <div className={styles.notes}>{notes}</div>}
      <div className={styles.hint}>The result replaces the canvas. Undo (Ctrl+Z) brings the previous plan back.</div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  box: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    // Checkbox labels stretch across the column otherwise, which centres their text.
    '& label:has(input[type="checkbox"])': { alignSelf: 'flex-start' },
  }),
  keyRow: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  attachment: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1),
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    '& > span': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  }),
  notes: css({
    whiteSpace: 'pre-wrap',
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  hint: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});
