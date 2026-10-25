import { PanelOptionsEditorBuilder, StandardEditorContext, standardEditorsRegistry } from '@grafana/data';
import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { plugin } from './module';
import { FloorMapOptions } from './types';

/**
 * Fingerprints of user-facing strings this project must never use: editor labels, messages and names
 * from the do-not-reproduce list of the concept spec. Stored as hashes so the strings themselves stay
 * out of the repository. Each is the first 16 hex digits of the SHA-256 of the lowercased words
 * joined by single spaces.
 */
const BANNED_PHRASES = new Set([
  '73b50c06bc3aeb7c',
  '4c9d7019f5373eef',
  '571bd50e3a5d87ff',
  '2098bee1bfdb4637',
  '99bd661f091e36fd',
  '15a9df8c0d9967de',
  'ba836fd303fcb743',
  '4613de1c4fa49b3d',
  'd0cb8d28fd8ddcf3',
  '47f259aa42101ed2',
  '24ceded53a9fc892',
  '588b271ec62b96ea',
  'fdea58d3562ff033',
]);
/** An option category name, banned only as a category because the words are common in prose. */
const BANNED_CATEGORY = 'e038439104d13901';
const LONGEST_PHRASE = 6;

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const fingerprint = (phrase: string[]) => createHash('sha256').update(phrase.join(' ')).digest('hex').slice(0, 16);

/** Every run of 1 to LONGEST_PHRASE consecutive words in the text that matches a banned phrase. */
function bannedRuns(text: string, banned = BANNED_PHRASES): string[] {
  const all = words(text);
  const hits: string[] = [];
  for (let start = 0; start < all.length; start++) {
    for (let length = 1; length <= LONGEST_PHRASE && start + length <= all.length; length++) {
      const run = all.slice(start, start + length);
      if (banned.has(fingerprint(run))) {
        hits.push(run.join(' '));
      }
    }
  }
  return hits;
}

// Grafana fills the editor registry at start-up; the builder only needs the ids to exist.
standardEditorsRegistry.setInit(() =>
  ['text', 'number', 'radio', 'slider', 'boolean', 'strings', 'field-name'].map((id) => ({
    id,
    name: id,
    editor: () => null,
  }))
);

function optionTexts() {
  const builder = new PanelOptionsEditorBuilder<FloorMapOptions>();
  plugin.getPanelOptionsSupplier()(builder, { data: [] } as StandardEditorContext<FloorMapOptions>);
  return builder.getItems().map((item) => {
    const choices = (item.settings as { options?: Array<{ label?: string }> } | undefined)?.options ?? [];
    return {
      category: (item.category ?? []).join(' '),
      texts: [item.name, item.description ?? '', ...choices.map((choice) => choice.label ?? '')],
    };
  });
}

function filesUnder(path: string): string[] {
  if (statSync(path).isFile()) {
    return [path];
  }
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

describe('clean-room wording', () => {
  it('finds a banned phrase inside longer text, in any case and punctuation', () => {
    expect(fingerprint(words('Plan  Drawing!'))).toBe('774fd28ff92d1704');
    const banned = new Set([fingerprint(['plan', 'drawing'])]);
    expect(bannedRuns('Paste it into the plan-drawing option.', banned)).toEqual(['plan drawing']);
    expect(bannedRuns('Plan the drawing.', banned)).toEqual([]);
  });

  it('keeps every option label, description, choice and category off the banned list', () => {
    const items = optionTexts();
    expect(items.length).toBeGreaterThan(10);
    const hits = items.flatMap((item) => [
      ...item.texts.flatMap((text) => bannedRuns(text)).map((run) => `${item.texts[0]}: ${run}`),
      ...(fingerprint(words(item.category)) === BANNED_CATEGORY ? [`${item.texts[0]}: category ${item.category}`] : []),
    ]);
    expect(hits).toEqual([]);
  });

  it('keeps the README, docs, demo and source text off the banned list', () => {
    const root = join(__dirname, '..');
    const files = ['README.md', 'CHANGELOG.md', 'docs', 'demo', 'provisioning', 'src']
      .flatMap((path) => filesUnder(join(root, path)))
      .filter((file) => /\.(md|ts|tsx|json|ya?ml|svg|mjs)$/.test(file));
    expect(files.length).toBeGreaterThan(20);
    const hits = files.flatMap((file) =>
      bannedRuns(readFileSync(file, 'utf8')).map((run) => `${relative(root, file)}: ${run}`)
    );
    expect(hits).toEqual([]);
  });
});
