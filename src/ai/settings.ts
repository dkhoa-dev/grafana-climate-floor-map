export type ProviderId = 'anthropic' | 'foundry' | 'openai' | 'grafana-llm';
export type OpenAiPreset = 'openai' | 'openrouter' | 'deepseek' | 'custom';

export interface AiSettings {
  provider: ProviderId;
  anthropicModel: string;
  /** Foundry resource name, e.g. `my-resource` for my-resource.services.ai.azure.com. */
  foundryResource: string;
  foundryModel: string;
  openAiPreset: OpenAiPreset;
  /** Only used by the custom preset; the others have fixed URLs. */
  openAiBaseUrl: string;
  openAiModel: string;
  llmModel: 'base' | 'large';
  /** Keep API keys in this browser's local storage. */
  remember: boolean;
  keys: Partial<Record<ProviderId, string>>;
}

export const CLAUDE_MODEL = 'claude-opus-5-5';

export const OPENAI_PRESETS: Record<OpenAiPreset, { label: string; baseUrl: string; images: boolean }> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', images: true },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', images: true },
  // DeepSeek's chat models take text only.
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', images: false },
  custom: { label: 'Custom', baseUrl: '', images: true },
};

export const PROVIDERS: Array<{ value: ProviderId; label: string; description: string }> = [
  { value: 'anthropic', label: 'Claude', description: 'Anthropic API, called from this browser with your key' },
  { value: 'foundry', label: 'Foundry', description: 'Claude deployed on Microsoft Foundry' },
  {
    value: 'openai',
    label: 'OpenAI-compatible',
    description: 'OpenAI, OpenRouter, DeepSeek or any compatible endpoint',
  },
  { value: 'grafana-llm', label: 'Grafana LLM', description: 'The Grafana LLM app plugin; keys stay on the server' },
];

const STORAGE_KEY = 'sensor-floor-map.ai';

export const defaultSettings = (): AiSettings => ({
  provider: 'anthropic',
  anthropicModel: CLAUDE_MODEL,
  foundryResource: '',
  foundryModel: CLAUDE_MODEL,
  openAiPreset: 'openai',
  openAiBaseUrl: '',
  openAiModel: '',
  llmModel: 'large',
  remember: false,
  keys: {},
});

export function loadSettings(): AiSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...defaultSettings(), ...stored, keys: { ...stored.keys } };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AiSettings) {
  try {
    const stored = settings.remember ? settings : { ...settings, keys: {} };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be unavailable (private mode); settings then last for this editor session only.
  }
}

export const needsKey = (s: AiSettings) => s.provider !== 'grafana-llm';

export const openAiBaseUrl = (s: AiSettings) =>
  (s.openAiPreset === 'custom' ? s.openAiBaseUrl : OPENAI_PRESETS[s.openAiPreset].baseUrl).replace(/\/+$/, '');

/** What the selected provider can read besides text. */
export function capabilities(s: AiSettings): { images: boolean; pdf: boolean } {
  switch (s.provider) {
    case 'anthropic':
    case 'foundry':
      return { images: true, pdf: true };
    case 'openai':
      return { images: OPENAI_PRESETS[s.openAiPreset].images, pdf: false };
    case 'grafana-llm':
      return { images: false, pdf: false };
  }
}

/** Why the settings cannot be used yet, or undefined when they can. */
export function missingSetting(s: AiSettings): string | undefined {
  if (needsKey(s) && !s.keys[s.provider]?.trim() && !(s.provider === 'openai' && s.openAiPreset === 'custom')) {
    return 'Enter an API key first.';
  }
  if (s.provider === 'foundry' && !s.foundryResource.trim()) {
    return 'Enter the Foundry resource name first.';
  }
  if (s.provider === 'openai') {
    if (!openAiBaseUrl(s)) {
      return 'Enter the base URL of the endpoint first.';
    }
    if (!s.openAiModel.trim()) {
      return 'Choose a model first.';
    }
  }
  return undefined;
}
