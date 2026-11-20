// Terminal output helpers: colour that respects NO_COLOR / FORCE_COLOR, text
// wrapping, and a spinner that only draws on an interactive stderr.

const PALETTE = {
  // CineBlock night-glass colours: electric blue for UI, warm orange for film moments.
  accent: [[249, 115, 22], 33],
  primary: [[96, 165, 250], 34],
  rating: [[251, 191, 36], 33],
  success: [[74, 222, 128], 32],
  danger: [[248, 113, 113], 31],
  muted: [[148, 163, 184], 90],
};

function colorMode({ env, stream, noColor }) {
  if (noColor || 'NO_COLOR' in env) return 'none';
  const force = env.FORCE_COLOR;
  if (force === '0' || force === 'false') return 'none';
  if (!force && !stream?.isTTY) return 'none';
  if (env.TERM === 'dumb' && !force) return 'none';
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM ?? '') || Boolean(env.WT_SESSION)
    || env.TERM_PROGRAM === 'iTerm.app' || env.TERM_PROGRAM === 'vscode' || force === '3';
  return truecolor ? 'truecolor' : 'basic';
}

/**
 * Build the style functions for one output stream.
 * Every function returns plain text unchanged when colour is off.
 */
export function createStyle({ env = process.env, stream = process.stdout, noColor = false } = {}) {
  const mode = colorMode({ env, stream, noColor });
  const wrap = (open, close) => (text) => (mode === 'none' ? String(text) : `\x1b[${open}m${text}\x1b[${close}m`);
  const style = { enabled: mode !== 'none', bold: wrap(1, 22), dim: wrap(2, 22), italic: wrap(3, 23) };
  for (const [name, [[r, g, b], basic]] of Object.entries(PALETTE)) {
    style[name] = mode === 'truecolor' ? wrap(`38;2;${r};${g};${b}`, 39) : wrap(basic, 39);
  }
  return style;
}

/** Word-wrap plain text to `width` columns, returning at most `maxLines` lines. */
export function wrapText(text, width, maxLines = Infinity) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length + 3 > width ? last.slice(0, width - 3).trimEnd() : last}...`;
  return kept;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Start a spinner on `stream`. Returns `stop()`. Draws nothing unless the stream is a TTY. */
export function startSpinner(stream, text, style) {
  if (!stream?.isTTY) return () => {};
  let i = 0;
  const draw = () => stream.write(`\r${style.primary(FRAMES[i++ % FRAMES.length])} ${style.muted(text)}\x1b[K`);
  draw();
  const timer = setInterval(draw, 80);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    stream.write('\r\x1b[K');
  };
}
