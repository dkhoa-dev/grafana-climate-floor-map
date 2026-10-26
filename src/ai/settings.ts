/** Which of the LLM app's two model tiers to use; the app maps each to a concrete model. */
export type LlmModel = 'base' | 'large';

export interface AiSettings {
  llmModel: LlmModel;
}

const STORAGE_KEY = 'sensor-floor-map.ai';

export const defaultSettings = (): AiSettings => ({ llmModel: 'large' });

export function loadSettings(): AiSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return stored.llmModel === 'base' || stored.llmModel === 'large'
      ? { llmModel: stored.llmModel }
      : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this editor session only.
  }
}
