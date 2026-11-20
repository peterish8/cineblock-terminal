// All help text. `cineblock help <topic>` and `cineblock <command> --help` print these.

export const MAIN_HELP = `CineBlock Terminal: five movies to watch, picked from your terminal.

Usage
  cineblock                     interactive menu (in a terminal)
  cineblock <command> [options]

Search (each uses 1 of your 15 daily searches)
  guided          The cineblock.in questions: story signal, language, era.
                  Five server-ranked picks. No AI key needed.
  ai "<request>"  Describe it in your own words. Uses your own AI key.

Free
  status          Who you're signed in as, searches left today
  list <name>     Your watchlist, liked or watched titles
  open <movie>    Open a movie on cineblock.in
  options         Every story signal, language and era
  login / logout  Save or remove your CineBlock Terminal token
  ai-key          Save or clear your Gemini, Groq or OpenRouter key

Options
  --json          One JSON object on stdout (see: cineblock help agents)
  --no-color      Plain text (NO_COLOR works too)
  -h, --help      Help for a command
  -v, --version   Version

Examples
  cineblock guided --signal "time loop" --language en,ko --era 2010s
  cineblock ai "slow-burn sci-fi with a hopeful ending"
  cineblock list watchlist --limit 10
  cineblock open 27205

Your token: sign in at https://www.cineblock.in, open Profile, copy the
CineBlock Terminal token (starts with cb_). The mcp_ token is for ChatGPT
and Claude connectors and does not work here.

More: cineblock help agents | exit-codes | <command>`;

const COMMAND_HELP = {
  guided: `cineblock guided [options]

The website's three questions, five server-ranked picks. In a terminal with
no options it asks you; otherwise it never asks and uses defaults.

  --signal <name>     Story signal, e.g. "time loop", heist. Default: any
  --language <codes>  Up to five, e.g. en,ko. Default: any
  --era <name>        recent (last 15 years, default), new, 2010s, 2000s,
                      1990s, 1980s, classic, any
  --from <year>       Start year, 1950 or later (instead of --era)
  --to <year>         End year (instead of --era)
  --exclude <ids>     TMDB IDs to leave out, comma separated
  --json

When the story signal is any, your recent liked, watchlist and watched
titles help rank the picks, like on the website.

  cineblock guided --signal heist --language ko --from 2015 --to 2024 --json`,

  ai: `cineblock ai "<what you want to watch>" [options]

Your AI suggests, CineBlock checks each title is real and returns up to five.
The AI is asked first, so a bad key never uses up a search. Your key goes
only to your provider.

  --model <id>      Another model from your provider (or CINEBLOCK_AI_MODEL)
  --exclude <ids>   TMDB IDs to leave out, comma separated
  --json

Key: \`cineblock ai-key\`, or CINEBLOCK_AI_KEY for one run.

  cineblock ai "movies like Arrival but warmer"`,

  login: `cineblock login [--token-stdin]

Checks your CineBlock Terminal token with cineblock.in, then saves it in
your system keychain (or a private file if there's no keychain). Get it at
https://www.cineblock.in > Profile > CineBlock Terminal. It starts with cb_.
mcp_ tokens are for ChatGPT and Claude connectors and are refused.

  --token-stdin   Read the token from stdin instead of asking

For CI or one-off runs, set CINEBLOCK_TOKEN instead.`,

  logout: `cineblock logout

Removes the saved CLI token from this computer.`,

  status: `cineblock status [--json]

Who the token belongs to, searches left and when they refill, where the
token is stored, and your AI provider. Never uses a search.`,

  list: `cineblock list <watchlist|liked|watched> [--limit 1-100] [--json]

Your newest titles first. Never uses a search.`,

  open: `cineblock open <tmdb-id | cineblock.in movie link> [--print] [--json]

Opens the movie on cineblock.in. --print just prints the link.`,

  'ai-key': `cineblock ai-key [--key-stdin | --clear]

Saves the key for \`cineblock ai\`: Gemini (AIza...), Groq (gsk_...) or
OpenRouter (sk-or-...). In a terminal with no options it asks for it.

  Gemini       https://aistudio.google.com/apikey
  Groq         https://console.groq.com/keys
  OpenRouter   https://openrouter.ai/keys`,

  options: `cineblock options [--json]

Every story signal, language and era that guided search accepts.`,
};

const TOPIC_HELP = {
  'exit-codes': `Exit codes

  0    Success
  1    Unexpected error
  2    Bad command or option (USAGE)
  3    Not signed in, or the token was refused (AUTH_MISSING, AUTH_INVALID)
  4    Daily searches used up (QUOTA_EXCEEDED)
  5    CineBlock unreachable, busy or failing (NETWORK, RATE_LIMITED, SERVER, NOT_AVAILABLE)
  6    AI key missing or the AI provider failed (AI_KEY_MISSING, AI_PROVIDER)
  7    The search found nothing (NO_RESULTS)
  130  Stopped with Ctrl+C`,

  agents: `Calling CineBlock Terminal from scripts and AI agents

1. Set CINEBLOCK_TOKEN=cb_... (the user copies it from Profile on
   cineblock.in). Never ask for or use their mcp_ token; that one is for
   ChatGPT and Claude connectors.
2. Pass --json. stdout gets exactly one object; check "ok" and the exit
   code (cineblock help exit-codes). Show error.message and error.hint as is.
3. Nothing prompts when stdin or stdout isn't a terminal, or when options
   are given. Missing guided options use the website defaults.
4. guided and ai each use one of the user's 15 daily searches. status, list,
   options and open --print are free; check status first before a batch.
5. Get valid values from \`cineblock options --json\`.
6. For different picks, run the search again with --exclude <shown tmdbIds>.
   That is a new search and uses quota.
7. AI search needs the user's key in CINEBLOCK_AI_KEY. Without one, offer
   guided search.

JSON (schemaVersion 1; fields are only ever added)
  { "schemaVersion": 1, "ok": true, "command": "guided",
    "filters": {...} (guided) or "query": "..." (ai),
    "quota": { "used", "remaining", "limit", "resetsAt" },
    "results": [ { "tmdbId", "title", "year", "rating", "overview",
                   "genres", "reason", "url" } ] }
  status   account { name, tokenSource }, quota, ai { provider, model, keySaved }
  list     list, total, items [ { tmdbId, title, addedAt, url } ]
  options  signals [ { label, slug, id } ], languages [ { code, name } ], eras
  open     tmdbId, url, opened
  Errors   { "schemaVersion": 1, "ok": false, "command": "...",
             "error": { "code", "message", "hint", "exitCode" } }

  cineblock guided --signal "plot twist" --language en --era 2010s --json`,
};

export function helpFor(topic) {
  return topic ? COMMAND_HELP[topic] ?? TOPIC_HELP[topic] ?? null : MAIN_HELP;
}
