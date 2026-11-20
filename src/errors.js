// Every failure the CLI can report, with the exit code scripts and agents can rely on.
// Keep this table in sync with the "Exit codes" section in src/help.js and README.md.
export const EXIT_CODES = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  AUTH: 3,
  QUOTA: 4,
  UNAVAILABLE: 5,
  AI: 6,
  NO_RESULTS: 7,
  INTERRUPTED: 130,
};

const EXIT_BY_CODE = {
  USAGE: EXIT_CODES.USAGE,
  AUTH_MISSING: EXIT_CODES.AUTH,
  AUTH_INVALID: EXIT_CODES.AUTH,
  QUOTA_EXCEEDED: EXIT_CODES.QUOTA,
  RATE_LIMITED: EXIT_CODES.UNAVAILABLE,
  NETWORK: EXIT_CODES.UNAVAILABLE,
  SERVER: EXIT_CODES.UNAVAILABLE,
  NOT_AVAILABLE: EXIT_CODES.UNAVAILABLE,
  AI_KEY_MISSING: EXIT_CODES.AI,
  AI_PROVIDER: EXIT_CODES.AI,
  NO_RESULTS: EXIT_CODES.NO_RESULTS,
  INTERRUPTED: EXIT_CODES.INTERRUPTED,
  INTERNAL: EXIT_CODES.ERROR,
};

export class CliError extends Error {
  /**
   * @param {keyof typeof EXIT_BY_CODE} code stable machine-readable code
   * @param {string} message plain sentence for people
   * @param {{ hint?: string }} [extra] what to do next
   */
  constructor(code, message, { hint } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code in EXIT_BY_CODE ? code : 'INTERNAL';
    this.hint = hint ?? null;
  }

  get exitCode() {
    return EXIT_BY_CODE[this.code];
  }
}

/** Wrap anything thrown into a CliError so the caller has one shape to report. */
export function toCliError(err) {
  if (err instanceof CliError) return err;
  if (err?.name === 'ExitPromptError' || err?.name === 'AbortPromptError') {
    return new CliError('INTERRUPTED', 'Stopped.');
  }
  return new CliError('INTERNAL', `Something unexpected went wrong: ${err?.message ?? String(err)}`, {
    hint: 'If this keeps happening, open an issue at https://github.com/peterish8/cineblock-terminal/issues',
  });
}
