import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import {
  Alert,
  Button,
  Checkbox,
  ClipboardButton,
  RadioButtonGroup,
  Stack,
  TextArea,
  TextLink,
  useStyles2,
} from '@grafana/ui';
import { PlanModel, serializePlan } from '../editor/model';
import { describeError, generatePlan, grafanaLlmStatus, isAbort } from './grafanaLlm';
import { buildChatPrompt, GenerateRequest, resultFromReply } from './prompt';
import { AiSettings, LlmModel, loadSettings, saveSettings } from './settings';

const FIX_FORMAT =
  'Convert the current plan to the output format. Keep every room, its name and its geometry; only fix the markup.';

const LLM_APP_URL = 'https://grafana.com/grafana/plugins/grafana-llm-app/';

interface Props {
  plan: PlanModel;
  dataRooms: string[];
  onResult: (plan: PlanModel) => void;
}

/**
 * Builds a prompt for any AI chat and reads back the SVG it replies with, so no provider or key is configured here.
 * When the Grafana LLM app is set up, the same request can also be sent straight from Grafana.
 */
export const AiAssistant: React.FC<Props> = ({ plan, dataRooms, onResult }) => {
  const styles = useStyles2(getStyles);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const hasPlan = plan.shapes.length > 0 || plan.staticMarkup.trim() !== '';

  const [instruction, setInstruction] = useState('');
  const [useCurrent, setUseCurrent] = useState(hasPlan);
  const [traceAttachment, setTraceAttachment] = useState(false);
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; message?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notes, setNotes] = useState<string>();

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    grafanaLlmStatus().then((status) => {
      if (!cancelled) {
        setLlmStatus(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fromCurrent = useCurrent && hasPlan;
  // With nothing typed, starting from the current plan means fixing its format.
  const text = instruction.trim() || (fromCurrent && !traceAttachment ? FIX_FORMAT : '');
  const request = (): GenerateRequest => ({
    instruction: text,
    currentSvg: fromCurrent ? serializePlan(plan) : undefined,
    traceAttachment,
    dataRooms,
  });
  const canAsk = text !== '' || traceAttachment;

  const show = (result: { plan: PlanModel; notes: string }) => {
    onResult(result.plan);
    setNotes(result.notes || undefined);
    setError(undefined);
  };

  const applyReply = () => {
    try {
      show(resultFromReply(reply));
      setReply('');
    } catch (e) {
      setError(describeError(e));
    }
  };

  const setModel = (llmModel: LlmModel) => {
    const next = { ...settings, llmModel };
    setSettings(next);
    saveSettings(next);
  };

  const generate = async () => {
    setBusy(true);
    setError(undefined);
    setNotes(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await generatePlan(settings.llmModel, { ...request(), signal: controller.signal });
      if (!controller.signal.aborted) {
        show(result);
      }
    } catch (e) {
      if (!isAbort(e, controller.signal)) {
        setError(describeError(e));
      }
    } finally {
      setBusy(false);
      abortRef.current = undefined;
    }
  };

  return (
    <div className={styles.box} data-testid="floor-plan-ai">
      <TextArea
        rows={4}
        value={instruction}
        placeholder={
          'Describe the floor, e.g. "Open office on the left, three meeting rooms along the top, server room by the stairs". ' +
          'Leave empty to only fix the format of the current plan.'
        }
        onChange={(e) => setInstruction(e.currentTarget.value)}
        disabled={busy}
      />
      <Checkbox
        label="Start from the current plan"
        value={fromCurrent}
        disabled={!hasPlan || busy}
        onChange={(e) => setUseCurrent(e.currentTarget.checked)}
      />
      <Checkbox
        label="I will attach an image or PDF of the floor plan"
        value={traceAttachment}
        disabled={busy}
        onChange={(e) => setTraceAttachment(e.currentTarget.checked)}
      />

      <div className={styles.section}>
        <div className={styles.heading}>Any AI chat</div>
        <ClipboardButton
          icon="copy"
          variant="secondary"
          size="sm"
          disabled={!canAsk}
          getText={() => buildChatPrompt(request())}
          onClipboardCopy={() => setCopied(true)}
          data-testid="floor-plan-ai-copy"
        >
          Copy prompt
        </ClipboardButton>
        <div className={styles.hint}>
          {copied ? 'Copied. ' : ''}Paste it into ChatGPT, Claude, Gemini, DeepSeek or another chat
          {traceAttachment ? ', attach the floor plan,' : ''} and paste the reply below. Plain SVG markup works too.
        </div>
        <TextArea
          rows={3}
          value={reply}
          placeholder="Paste the reply or an SVG here"
          onChange={(e) => setReply(e.currentTarget.value)}
          data-testid="floor-plan-ai-reply"
        />
        <Button size="sm" icon="check" disabled={!reply.trim()} onClick={applyReply}>
          Apply
        </Button>
      </div>

      <div className={styles.section}>
        <div className={styles.modelRow}>
          <span className={styles.heading}>Grafana LLM</span>
          {llmStatus?.ok && (
            <RadioButtonGroup<LlmModel>
              size="sm"
              options={[
                { value: 'large', label: 'Large', description: 'More capable model, as set in the LLM app' },
                { value: 'base', label: 'Base', description: 'Faster, cheaper model, as set in the LLM app' },
              ]}
              value={settings.llmModel}
              onChange={setModel}
              disabled={busy}
            />
          )}
        </div>
        {llmStatus && !llmStatus.ok ? (
          <div className={styles.hint} data-testid="floor-plan-ai-llm-status">
            {llmStatus.message} To generate without leaving Grafana, an admin can set up the{' '}
            <TextLink href={LLM_APP_URL} external inline>
              Grafana LLM app
            </TextLink>
            .
          </div>
        ) : busy ? (
          <Stack gap={1} alignItems="center">
            <Button icon="spinner" disabled fullWidth>
              Drawing…
            </Button>
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          </Stack>
        ) : (
          <Button
            icon="ai"
            disabled={!llmStatus?.ok || !canAsk || traceAttachment}
            tooltip={
              traceAttachment
                ? 'The Grafana LLM app reads text only. Use the copied prompt to trace a file.'
                : undefined
            }
            onClick={generate}
            fullWidth
          >
            Generate
          </Button>
        )}
      </div>

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
  section: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    paddingTop: theme.spacing(1),
    borderTop: `1px solid ${theme.colors.border.weak}`,
    '& > textarea, & > div:has(textarea)': { alignSelf: 'stretch' },
  }),
  heading: css({
    fontWeight: theme.typography.fontWeightMedium,
    color: theme.colors.text.primary,
  }),
  modelRow: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
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
