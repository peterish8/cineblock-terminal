// Turns results into text for people or JSON for scripts. Pure functions:
// they return strings and never write to a stream.
import { wrapText } from './term.js';

export const SCHEMA_VERSION = 1;

/** Success envelope for --json. See "JSON output" in README.md for every field. */
export function jsonSuccess(command, data) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, ok: true, command, ...data }, null, 2);
}

/** Error envelope for --json. Printed on stdout so a caller only reads one stream. */
export function jsonError(command, err) {
  const error = { code: err.code, message: err.message, hint: err.hint ?? null, exitCode: err.exitCode };
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, ok: false, command: command ?? null, error }, null, 2);
}

export function formatResetIn(resetsAt, now = Date.now()) {
  const minutes = Math.max(1, Math.round((Date.parse(resetsAt) - now) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatQuota(quota, style, now = Date.now()) {
  if (!quota) return '';
  const left = quota.remaining === 0 ? style.danger('No searches left today') : `${style.bold(String(quota.remaining))} of ${quota.limit} searches left today`;
  return `${left}${style.muted(` · refills in ${formatResetIn(quota.resetsAt, now)} (midnight UTC)`)}`;
}

function cardWidth(columns) {
  return Math.max(40, Math.min(Number(columns) || 80, 100));
}

/**
 * One poster-less card per movie:
 *   1  Inception  2010  ★ 8.4
 *      Action · Science Fiction
 *      Overview wrapped to the terminal...
 *      Why: reason from the AI (AI search only)
 *      https://www.cineblock.in/movie/inception-27205
 */
export function formatMovies(movies, style, { columns = 80, startAt = 1 } = {}) {
  const width = cardWidth(columns);
  const indent = '     ';
  const textWidth = width - indent.length - 1;
  return movies.map((movie, i) => {
    const number = style.muted(String(startAt + i).padStart(3, ' '));
    const year = movie.year ? style.muted(`  ${movie.year}`) : '';
    const rating = movie.rating ? `  ${style.rating(`★ ${movie.rating.toFixed(1)}`)}` : `  ${style.muted('not rated yet')}`;
    const lines = [`${number}  ${style.bold(style.accent(movie.title))}${year}${rating}`];
    if (movie.genres.length) lines.push(indent + style.primary(movie.genres.slice(0, 3).join(' · ')));
    const overview = wrapText(movie.overview || 'No overview yet.', textWidth, 3);
    lines.push(...overview.map((line) => indent + line));
    if (movie.reason) {
      const reason = wrapText(`Why: ${movie.reason}`, textWidth, 2);
      lines.push(...reason.map((line) => indent + style.italic(style.muted(line))));
    }
    lines.push(indent + style.muted(movie.url));
    return lines.join('\n');
  }).join('\n\n');
}

export function formatLibrary({ list, total, items }, style, { columns = 80 } = {}) {
  const names = { watchlist: 'Watchlist', liked: 'Liked', watched: 'Watched' };
  const count = total !== null && total > items.length ? `showing ${items.length} of ${total}` : `${items.length} ${items.length === 1 ? 'title' : 'titles'}`;
  const header = `${style.bold(names[list] ?? list)}  ${style.muted(count)}`;
  if (items.length === 0) return header;
  const width = cardWidth(columns);
  const rows = items.map((item, i) => {
    const date = item.addedAt ? item.addedAt.slice(0, 10) : '';
    const titleWidth = Math.max(10, width - 20);
    const title = item.title.length > titleWidth ? `${item.title.slice(0, titleWidth - 3)}...` : item.title;
    return `${style.muted(String(i + 1).padStart(3, ' '))}  ${style.accent(title.padEnd(titleWidth))} ${style.muted(date)}`;
  });
  return [header, '', ...rows].join('\n');
}

/** Plain-language error block for people, written to stderr. */
export function formatError(err, style) {
  const lines = [`${style.danger('✖')} ${err.message}`];
  if (err.hint) lines.push(`  ${style.muted(err.hint)}`);
  return lines.join('\n');
}
