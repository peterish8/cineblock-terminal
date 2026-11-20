// The three guided questions, kept identical to the Find My Movie wizard on
// cineblock.in (src/components/FindMyMovie in the movieX repo):
//   1. story signal (one TMDB keyword, optional)
//   2. original language (Any, or up to five)
//   3. release era (any year range from 1950 to this year; the site defaults to the last 15 years)
// The server (/api/find-movie) does all ranking. This module only turns
// answers or flags into the exact request body the website sends.
import { CliError } from './errors.js';

export const QUESTIONS = {
  signal: { title: 'Pick a story signal', help: "Choose one strong narrative cue and we'll keep the search anchored to it." },
  language: { title: 'Choose language', help: "Prioritize the original language. We'll stay strict unless you leave it open." },
  era: { title: 'Set the era', help: 'Keep the release window tight if you want more accurate matches.' },
};

// Same labels, IDs and order as KEYWORD_CHIPS on the website.
export const STORY_SIGNALS = [
  { label: 'Time Loop', id: 10854 },
  { label: 'Based on Novel', id: 818 },
  { label: 'True Story', id: 9672 },
  { label: 'Found Footage', id: 11308 },
  { label: 'Dystopia', id: 4565 },
  { label: 'Post-Apocalyptic', id: 4458 },
  { label: 'Heist', id: 10349 },
  { label: 'Road Trip', id: 1721 },
  { label: 'Coming of Age', id: 10683 },
  { label: 'Survival', id: 5565 },
  { label: 'Cult Classic', id: 12554 },
  { label: 'Mind Bending', id: 4344 },
  { label: 'Tear Jerker', id: 11800 },
  { label: 'Feel Good', id: 15060 },
  { label: 'Dark Humour', id: 10941 },
  { label: 'Plot Twist', id: 3801 },
  { label: 'Slow Burn', id: 282 },
  { label: 'Revenge', id: 3995 },
  { label: 'Unlikely Duo', id: 3265 },
  { label: 'Found Family', id: 193498 },
  { label: 'Antihero', id: 9748 },
  { label: 'Space Travel', id: 803 },
  { label: 'Parallel Universe', id: 207317 },
  { label: 'Artificial Intelligence', id: 9951 },
  { label: 'Time Travel', id: 4379 },
  { label: 'Underwater', id: 11322 },
  { label: 'K-Drama', id: 318385 },
  { label: 'C-Drama', id: 292014 },
].map((signal) => ({ ...signal, slug: slugify(signal.label) }));

// Same codes and order as ALL_LANGUAGES on the website.
export const LANGUAGES = [
  { code: 'any', name: 'Any language', native: '' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'Hindi' },
  { code: 'ta', name: 'Tamil', native: 'Tamil' },
  { code: 'te', name: 'Telugu', native: 'Telugu' },
  { code: 'ml', name: 'Malayalam', native: 'Malayalam' },
  { code: 'kn', name: 'Kannada', native: 'Kannada' },
  { code: 'es', name: 'Spanish', native: 'Espanol' },
  { code: 'fr', name: 'French', native: 'Francais' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: 'Nihongo' },
  { code: 'ko', name: 'Korean', native: 'Hanguk-eo' },
  { code: 'zh', name: 'Chinese', native: 'Zhongwen' },
  { code: 'pt', name: 'Portuguese', native: 'Portugues' },
  { code: 'ru', name: 'Russian', native: 'Russkiy' },
  { code: 'ar', name: 'Arabic', native: 'Arabiyyah' },
  { code: 'tr', name: 'Turkish', native: 'Turkce' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'th', name: 'Thai', native: 'Phasa Thai' },
];

export const MAX_LANGUAGES = 5;
export const MIN_YEAR = 1950;

/**
 * Named shortcuts for the era question. The website uses a free slider; these
 * cover the common picks and `--from/--to` covers everything else.
 * `recent` is the website's default window.
 */
export function eraPresets(now = new Date()) {
  const year = now.getUTCFullYear();
  return [
    { name: 'recent', label: `Last 15 years (${Math.max(MIN_YEAR, year - 15)} to ${year})`, yearFrom: Math.max(MIN_YEAR, year - 15), yearTo: year },
    { name: 'new', label: `New releases (${year - 5} to ${year})`, yearFrom: year - 5, yearTo: year },
    { name: '2010s', label: '2010s', yearFrom: 2010, yearTo: 2019 },
    { name: '2000s', label: '2000s', yearFrom: 2000, yearTo: 2009 },
    { name: '1990s', label: '1990s', yearFrom: 1990, yearTo: 1999 },
    { name: '1980s', label: '1980s', yearFrom: 1980, yearTo: 1989 },
    { name: 'classic', label: `Classics (${MIN_YEAR} to 1979)`, yearFrom: MIN_YEAR, yearTo: 1979 },
    { name: 'any', label: `Any year (${MIN_YEAR} to ${year})`, yearFrom: MIN_YEAR, yearTo: year },
  ];
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+)|(-+$)/g, '');
}

/** "time loop", "Time-Loop", "time_loop", "10854" and "any" all resolve. Returns a keyword id or null. */
export function resolveSignal(input) {
  if (input === undefined || input === null || input === '') return null;
  const wanted = slugify(String(input));
  if (wanted === 'any' || wanted === 'none') return null;
  const match = STORY_SIGNALS.find((s) => s.slug === wanted || String(s.id) === wanted);
  if (!match) {
    throw new CliError('USAGE', `"${input}" is not one of the story signals.`, {
      hint: 'Run `cineblock options` to see them all, for example: --signal "time loop".',
    });
  }
  return match.id;
}

/** Accepts codes or names, comma separated or as an array. Returns ['any'] or up to five codes. */
export function resolveLanguages(input) {
  const parts = (Array.isArray(input) ? input : [input ?? 'any'])
    .flatMap((part) => String(part).split(','))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return ['any'];

  const codes = [];
  for (const part of parts) {
    const match = LANGUAGES.find((l) => l.code === part || l.name.toLowerCase() === part || l.native.toLowerCase() === part);
    if (!match) {
      throw new CliError('USAGE', `"${part}" is not one of the supported languages.`, {
        hint: 'Use a code like en, ko or hi. Run `cineblock options` for the full list.',
      });
    }
    if (match.code === 'any') return ['any'];
    if (!codes.includes(match.code)) codes.push(match.code);
  }
  if (codes.length > MAX_LANGUAGES) {
    throw new CliError('USAGE', `Pick up to ${MAX_LANGUAGES} languages. You gave ${codes.length}.`);
  }
  return codes;
}

function parseYear(value, flag, maxYear) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) {
    throw new CliError('USAGE', `${flag} must be a year from ${MIN_YEAR} to ${maxYear}. You gave "${value}".`);
  }
  return year;
}

/** Resolve `--era name` or `--from/--to` into a year range. Defaults to the website's last 15 years. */
export function resolveEra({ era, from, to } = {}, now = new Date()) {
  const presets = eraPresets(now);
  const maxYear = now.getUTCFullYear();
  if (era !== undefined && (from !== undefined || to !== undefined)) {
    throw new CliError('USAGE', 'Use either --era or --from/--to, not both.');
  }
  if (era !== undefined) {
    const preset = presets.find((p) => p.name === String(era).toLowerCase());
    if (!preset) {
      throw new CliError('USAGE', `"${era}" is not an era.`, { hint: `Try one of: ${presets.map((p) => p.name).join(', ')}. Or use --from and --to.` });
    }
    return { yearFrom: preset.yearFrom, yearTo: preset.yearTo };
  }
  if (from === undefined && to === undefined) {
    const { yearFrom, yearTo } = presets[0];
    return { yearFrom, yearTo };
  }
  const yearFrom = from === undefined ? MIN_YEAR : parseYear(from, '--from', maxYear);
  const yearTo = to === undefined ? maxYear : parseYear(to, '--to', maxYear);
  if (yearFrom > yearTo) throw new CliError('USAGE', `--from (${yearFrom}) is after --to (${yearTo}).`);
  return { yearFrom, yearTo };
}

/** Flags in, the exact /api/find-movie filters out. */
export function buildGuidedFilters({ signal, language, era, from, to } = {}, now = new Date()) {
  return {
    keywordId: resolveSignal(signal),
    languages: resolveLanguages(language),
    ...resolveEra({ era, from, to }, now),
  };
}

/** Human summary of a filter set, e.g. "Time Loop · Korean, Japanese · 2010 to 2019". */
export function describeFilters({ keywordId, languages, yearFrom, yearTo }) {
  const signal = STORY_SIGNALS.find((s) => s.id === keywordId)?.label ?? 'Any story signal';
  const langs = languages.includes('any')
    ? 'Any language'
    : languages.map((code) => LANGUAGES.find((l) => l.code === code)?.name ?? code).join(', ');
  return `${signal} · ${langs} · ${yearFrom} to ${yearTo}`;
}
