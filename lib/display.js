import terminalImage from 'terminal-image';
import terminalLink from 'terminal-link';
import chalk from 'chalk';
import sharp from 'sharp';
import { sixelEncode } from 'sixel';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const POSTER_COLS  = 40;         // block-char fallback width (columns)
const POSTER_PX    = 900;        // sixel pixel width — higher = sharper
const TMDB_SIZE    = 'w780';     // high-res TMDB poster (fast & sharp)
const DIVIDER      = chalk.hex('#1a1a1a')('─'.repeat(70));

// ── DETECTION ─────────────────────────────────────────────────────────────────

function isVSCode() {
  return (
    process.env.TERM_PROGRAM === 'vscode' ||
    !!process.env.VSCODE_PID ||
    !!process.env.VSCODE_INJECTION
  );
}

function isWindowsTerminal() {
  return !!process.env.WT_SESSION || !!process.env.WTPREFIX;
}

function supportsTrueColor() {
  return (
    process.env.COLORTERM === 'truecolor' ||
    process.env.COLORTERM === '24bit'     ||
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    isWindowsTerminal()
  );
}

// ── ITERM2 INLINE IMAGE (VS Code terminal) ────────────────────────────────────

async function renderIterm2(imageBuffer) {
  try {
    const resized = await sharp(imageBuffer)
      .resize(900, null, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 1.2 })
      .png()
      .toBuffer();
    const b64  = resized.toString('base64');
    const size = resized.length;
    process.stdout.write(
      `\x1b]1337;File=inline=1;size=${size};width=40;preserveAspectRatio=1:${b64}\x07\n`
    );
    return true;
  } catch {
    return false;
  }
}

// ── SIXEL RENDERER ────────────────────────────────────────────────────────────

async function renderSixel(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(POSTER_PX, null, {
        fit: 'inside',
        kernel: sharp.kernel.lanczos3,  // sharpest resampling algo
      })
      .sharpen({ sigma: 1.2 })          // extra crispness pass
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rgba     = new Uint8ClampedArray(data.buffer);
    const sixelData = sixelEncode(rgba, info.width, info.height);

    process.stdout.write('\x1bPq' + sixelData + '\x1b\\\n');
    return true;
  } catch (err) {
    return false;
  }
}

// ── BLOCK-CHAR FALLBACK ───────────────────────────────────────────────────────

async function renderBlockChars(imageBuffer) {
  try {
    // Sharpen before downscaling to block chars — helps a lot
    const sharpened = await sharp(imageBuffer)
      .resize(300, null, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.8 })
      .toBuffer();

    const rendered = await terminalImage.buffer(sharpened, {
      width: POSTER_COLS,
      preserveAspectRatio: true,
    });
    if (!rendered || rendered.trim().length === 0) return false;
    rendered.split('\n').forEach(l => console.log('  ' + l));
    return true;
  } catch {
    return false;
  }
}

// ── PLACEHOLDER ───────────────────────────────────────────────────────────────

function printPlaceholder() {
  const w     = POSTER_COLS;
  const b     = chalk.hex('#2a2a2a');
  const label = 'NO POSTER AVAILABLE';
  const pad   = Math.floor((w - label.length) / 2);
  console.log(b('  ┌' + '─'.repeat(w) + '┐'));
  console.log(b('  │') + ' '.repeat(w) + b('│'));
  console.log(b('  │') + ' '.repeat(pad) + chalk.hex('#3a3a3a')(label) + ' '.repeat(w - pad - label.length) + b('│'));
  console.log(b('  │') + ' '.repeat(w) + b('│'));
  console.log(b('  └' + '─'.repeat(w) + '┘'));
}

// ── MAIN POSTER ENTRY ─────────────────────────────────────────────────────────

async function renderPoster(posterPath) {
  if (!posterPath) { printPlaceholder(); return; }

  let imageBuffer = null;
  try {
    // w500 instead of w300 — bigger source = sharper output
    const url = `https://image.tmdb.org/t/p/${TMDB_SIZE}${posterPath}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
  } catch { /* fall through */ }

  if (!imageBuffer) { printPlaceholder(); return; }

  if (isVSCode()) {
    const ok = await renderIterm2(imageBuffer);
    if (ok) return;
  }

  if (isWindowsTerminal()) {
    const ok = await renderSixel(imageBuffer);
    if (ok) return;
  }

  if (supportsTrueColor()) {
    const ok = await renderBlockChars(imageBuffer);
    if (ok) return;
  }

  printPlaceholder();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function formatRuntime(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ── CARD ──────────────────────────────────────────────────────────────────────

export async function renderMovieCard(movie, index) {
  console.log('\n' + DIVIDER + '\n');
  await renderPoster(movie.poster_path);

  const num     = chalk.hex('#555555')(`\n  ${index + 1}.`);
  const title   = chalk.hex('#FF9900').bold(` ${movie.title}`);
  const year    = chalk.hex('#555555')(` (${movie.release_year ?? '?'})`);
  const rating  = chalk.hex('#FFCC44')(`★ ${Number(movie.vote_average ?? 0).toFixed(1)}`);
  const runtime = chalk.hex('#666666')(formatRuntime(movie.runtime_minutes));
  const genres  = (movie.genres ?? []).slice(0, 2)
    .map(g => chalk.bgHex('#1e1e1e').hex('#888888')(` ${g} `)).join('  ');
  const url  = `https://cineblock.in/movie/${movie.tmdb_id}`;
  const link = terminalLink(
    chalk.hex('#FF9900')('↗ Open on CineBlock'),
    url,
    { fallback: (t, u) => `${t}  →  ${u}` }
  );

  console.log(`${num}${title}${year}`);
  console.log(`\n     ${rating}   │   ${runtime}   │   ${genres}`);
  console.log(`\n     ${chalk.hex('#555555')(truncate(movie.overview, 130))}`);
  if (movie.reason) {
    console.log(`\n     ${chalk.hex('#FF9900').bold('[AI CURATE]')} ${chalk.hex('#BBBBBB').italic(movie.reason)}`);
  }
  console.log(`\n     ${link}`);
}

export async function renderPage(movies) {
  for (let i = 0; i < movies.length; i++) await renderMovieCard(movies[i], i);
  console.log('\n' + DIVIDER + '\n');
}