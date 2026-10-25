import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import {
  Alert,
  Button,
  Checkbox,
  Combobox,
  Field,
  IconButton,
  Input,
  RadioButtonGroup,
  Stack,
  TextArea,
  useStyles2,
} from '@grafana/ui';
import { PlanModel, serializePlan } from '../editor/model';
import { ACCEPTED_FILES, readAttachment } from './attachments';
import type { Attachment } from './prompt';
import {
  AiSettings,
  capabilities,
  CLAUDE_MODEL,
  loadSettings,
  needsKey,
  OPENAI_PRESETS,
  OpenAiPreset,
  PROVIDERS,
  ProviderId,
  saveSettings,
} from './settings';

// Provider clients are large, so they are only fetched when someone actually uses the assistant.
const loadAi = () => import(/* webpackChunkName: "ai" */ './generatePlan');

const FIX_FORMAT =
  'Convert the current plan to the output format. Keep every room, its name and its geometry; only fix the markup.';

const KEY_HELP: Partial<Record<ProviderId, string>> = {
  anthropic: 'Sent only from this browser to api.anthropic.com.',
  foundry: 'Sent only from this browser to your Foundry resource.',
  openai: 'Sent only from this browser to the endpoint below.',
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

  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(() => {
    const s = loadSettings();
    return needsKey(s) && !s.keys[s.provider];
  });
  const [models, setModels] = useState<string[]>([]);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; message?: string }>();
  const [instruction, setInstruction] = useState('');
  const [attachment, setAttachment] = useState<Attachment>();
  const [useCurrent, setUseCurrent] = useState(hasPlan);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [notes, setNotes] = useState<string>();

  const can = capabilities(settings);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (settings.provider !== 'grafana-llm') {
      return;
    }
    let cancelled = false;
    import(/* webpackChunkName: "ai-grafana-llm" */ './grafanaLlm')
      .then((m) => m.grafanaLlmStatus())
      .then((status) => {
        if (!cancelled) {
          setLlmStatus(status);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [settings.provider]);

  const update = (change: Partial<AiSettings>) => {
    const next = { ...settings, ...change };
    setSettings(next);
    saveSettings(next);
  };
  const setKey = (key: string) => update({ keys: { ...settings.keys, [settings.provider]: key } });

  const loadModels = async () => {
    setError(undefined);
    try {
      const { listOpenAiModels } = await import(/* webpackChunkName: "ai-openai" */ './openaiCompatible');
      const ids = await listOpenAiModels(settings);
      setModels(ids);
      if (!ids.length) {
        setError('The endpoint returned no models. Type the model id instead.');
      }
    } catch (e) {
      setError(`Could not list models: ${e instanceof Error ? e.message : e}`);
    }
  };

  const run = async (text: string, fromCurrent: boolean) => {
    setBusy(true);
    setProgress(0);
    setError(undefined);
    setNotes(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    let ai: Awaited<ReturnType<typeof loadAi>> | undefined;
    try {
      ai = await loadAi();
      const result = await ai.generatePlan(settings, {
        instruction: text,
        currentSvg: fromCurrent && hasPlan ? serializePlan(plan) : undefined,
        attachment,
        dataRooms,
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (!controller.signal.aborted) {
        onResult(result.plan);
        setNotes(result.notes || undefined);
        setShowSettings(false);
      }
    } catch (e) {
      if (!ai) {
        setError(`Could not load the AI module: ${e instanceof Error ? e.message : e}`);
      } else if (!ai.isAbort(e, controller.signal)) {
        const message = ai.describeError(e);
        setError(message);
        if (/key|resource|base URL|model/i.test(message)) {
          setShowSettings(true);
        }
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

  const providerLabel = PROVIDERS.find((p) => p.value === settings.provider)?.label;
  const customEndpoint = settings.provider === 'openai' && settings.openAiPreset === 'custom';
  const attachmentBlocked =
    attachment !== undefined &&
    ((attachment.kind === 'pdf' && !can.pdf) || (attachment.kind === 'image' && !can.images));
  const canGenerate =
    !busy && !attachmentBlocked && (instruction.trim() !== '' || attachment !== undefined || (useCurrent && hasPlan));

  const settingsForm = (
    <div className={styles.settings} data-testid="floor-plan-ai-settings">
      <RadioButtonGroup<ProviderId>
        size="sm"
        options={PROVIDERS}
        value={settings.provider}
        onChange={(provider) => {
          update({ provider });
          setModels([]);
          setError(undefined);
        }}
      />

      {settings.provider === 'foundry' && (
        <Field label="Resource" description="The name before .services.ai.azure.com">
          <Input
            value={settings.foundryResource}
            placeholder="my-foundry-resource"
            onChange={(e) => update({ foundryResource: e.currentTarget.value })}
          />
        </Field>
      )}

      {settings.provider === 'openai' && (
        <>
          <RadioButtonGroup<OpenAiPreset>
            size="sm"
            options={Object.entries(OPENAI_PRESETS).map(([value, p]) => ({
              value: value as OpenAiPreset,
              label: p.label,
            }))}
            value={settings.openAiPreset}
            onChange={(openAiPreset) => {
              update({ openAiPreset });
              setModels([]);
            }}
          />
          {customEndpoint && (
            <Field label="Base URL" description="Must allow requests from the browser (CORS)">
              <Input
                value={settings.openAiBaseUrl}
                placeholder="http://localhost:11434/v1"
                onChange={(e) => update({ openAiBaseUrl: e.currentTarget.value })}
              />
            </Field>
          )}
        </>
      )}

      {needsKey(settings) && (
        <Field
          label={`${providerLabel} API key${customEndpoint ? ' (if needed)' : ''}`}
          description={`${KEY_HELP[settings.provider] ?? ''} Never saved in the dashboard.`}
        >
          <Input
            type="password"
            value={settings.keys[settings.provider] ?? ''}
            autoComplete="off"
            placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : 'API key'}
            onChange={(e) => setKey(e.currentTarget.value)}
          />
        </Field>
      )}

      {settings.provider === 'anthropic' && (
        <Field label="Model">
          <Input
            value={settings.anthropicModel}
            placeholder={CLAUDE_MODEL}
            onChange={(e) => update({ anthropicModel: e.currentTarget.value })}
          />
        </Field>
      )}
      {settings.provider === 'foundry' && (
        <Field label="Model deployment">
          <Input
            value={settings.foundryModel}
            placeholder={CLAUDE_MODEL}
            onChange={(e) => update({ foundryModel: e.currentTarget.value })}
          />
        </Field>
      )}
      {settings.provider === 'openai' && (
        <Field label="Model" description="Pick from the list or type a model id">
          <Stack gap={1}>
            <Combobox<string>
              options={models.map((m) => ({ value: m, label: m }))}
              value={settings.openAiModel || null}
              createCustomValue
              placeholder="Model id"
              isClearable
              onChange={(v) => update({ openAiModel: v?.value ?? '' })}
            />
            <IconButton name="sync" tooltip="Load the endpoint's model list" onClick={loadModels} />
          </Stack>
        </Field>
      )}
      {settings.provider === 'grafana-llm' && (
        <>
          <Field label="Model size" description="Mapped to a concrete model by the LLM app's settings">
            <RadioButtonGroup<'base' | 'large'>
              size="sm"
              options={[
                { value: 'large', label: 'Large' },
                { value: 'base', label: 'Base' },
              ]}
              value={settings.llmModel}
              onChange={(llmModel) => update({ llmModel })}
            />
          </Field>
          {llmStatus && !llmStatus.ok && (
            <Alert severity="warning" title="">
              {llmStatus.message}
            </Alert>
          )}
        </>
      )}

      {needsKey(settings) && (
        <Checkbox
          label="Remember keys and settings in this browser"
          value={settings.remember}
          onChange={(e) => update({ remember: e.currentTarget.checked })}
        />
      )}
    </div>
  );

  return (
    <div className={styles.box} data-testid="floor-plan-ai">
      <div className={styles.keyRow}>
        <span>
          {providerLabel}
          {settings.provider === 'openai' && ` · ${OPENAI_PRESETS[settings.openAiPreset].label}`}
        </span>
        <Button size="sm" variant="secondary" fill="text" icon="cog" onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? 'Hide settings' : 'Settings'}
        </Button>
      </div>
      {showSettings && settingsForm}

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
        <Button
          size="sm"
          variant="secondary"
          icon="upload"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !can.images}
          tooltip={can.images ? undefined : 'This provider takes text only'}
        >
          {can.pdf ? 'Trace an image or PDF' : 'Trace an image'}
        </Button>
      )}
      {attachmentBlocked && (
        <div className={styles.warning}>
          {attachment?.kind === 'pdf' ? 'Only Claude can read PDFs.' : 'This provider takes text only.'} Remove the file
          or switch provider.
        </div>
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
  settings: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
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
  warning: css({
    color: theme.colors.warning.text,
    fontSize: theme.typography.bodySmall.fontSize,
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
