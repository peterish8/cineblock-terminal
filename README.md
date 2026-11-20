# CineBlock Terminal

[![npm](https://img.shields.io/npm/v/cineblock.svg?style=flat-square)](https://www.npmjs.com/package/cineblock)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Five movies to watch, picked from your terminal. Answer the same three questions as the
[cineblock.in](https://www.cineblock.in) finder, or describe what you want in your own words
with your own AI key. Check your lists, see how many searches you have left, and open any
title on cineblock.in.

```text
$ cineblock guided --signal "time loop" --language en --era 2010s

Time Loop · English · 2010 to 2019

  1  Edge of Tomorrow  2014  ★ 7.6
     Action · Science Fiction
     Major Bill Cage is an officer who has never seen a day of combat when he
     is unceremoniously demoted and dropped into combat...
     https://www.cineblock.in/movie/edge-of-tomorrow-137113

  ...

11 of 15 searches left today · refills in 13h 13m (midnight UTC)
```

## Install

Needs Node.js 20.12 or newer.

```sh
npm install -g cineblock
cineblock
```

Or run it once without installing: `npx cineblock --help`.

## Sign in

The terminal uses its own token.

1. Sign in at [cineblock.in](https://www.cineblock.in) and open **Profile**.
2. Under **CineBlock Terminal**, generate or copy your token. It starts with `cb_`.
3. Run `cineblock login` and paste it, or just run `cineblock` and follow the prompt.

The token is saved in your system keychain (Windows Credential Manager, macOS Keychain or the
Linux Secret Service). If no keychain is available, it goes in a config file only your user can
read. For CI or one-off runs, set `CINEBLOCK_TOKEN` instead of logging in.

### CLI token vs MCP token

| Credential | Starts with | Used by | What it does |
| --- | --- | --- | --- |
| CLI token | `cb_` | CineBlock Terminal only | Searches (15 a day), your quota, reading your lists |
| MCP token | `mcp_` | ChatGPT or Claude connector only | Library actions, CineBlocks and stamps from an AI chat |

They are not interchangeable. The terminal refuses an `mcp_` token and tells you which one to use.

## Usage

Run `cineblock` with no arguments for the interactive menu. Every feature also works with flags.

| Command | What it does | Uses a search |
| --- | --- | --- |
| `cineblock guided` | Story signal, language and era, five server-ranked picks | Yes |
| `cineblock ai "<request>"` | Natural-language search with your own AI key | Yes |
| `cineblock status` | Who you're signed in as, searches left, AI setup | No |
| `cineblock list watchlist\|liked\|watched` | Your newest titles first | No |
| `cineblock open <id or link>` | Open a movie on cineblock.in (`--print` to just print the link) | No |
| `cineblock options` | Every story signal, language and era | No |
| `cineblock login` / `logout` | Save or remove your CLI token | No |
| `cineblock ai-key` | Save, change or clear your AI key | No |

Each search uses one of your 15 daily searches, no matter how many times you ask for five
different picks inside it. Searches refill at midnight UTC.

### Guided search

The same three questions as the website, sent to the same server ranking, five results:

```sh
cineblock guided                                   # asks you, in a terminal
cineblock guided --signal heist --language ko --from 2015 --to 2024
cineblock guided --signal "feel good" --era 1990s
cineblock guided --language en,hi --era recent     # recent = last 15 years, the website default
```

Like the website, when you leave the story signal open, your recent liked, watchlist and
watched titles help rank the picks.

### AI search

```sh
cineblock ai-key                                   # paste a Gemini, Groq or OpenRouter key
cineblock ai "slow-burn sci-fi with a hopeful ending"
cineblock ai "90s Hong Kong action" --model qwen/qwen3.6-27b --json
```

The provider is detected from the key (`AIza` Gemini, `gsk_` Groq, `sk-or-` OpenRouter). Your key
goes only to that provider, never to CineBlock. Every suggestion is checked against CineBlock's
movie data before it's shown, and a failed AI call never uses up a search. Default models:
`gemini-flash-latest`, and `openai/gpt-oss-120b` on Groq and OpenRouter. Change them with
`--model` or `CINEBLOCK_AI_MODEL`.

## Scripts and AI agents

Every command takes `--json` and prints exactly one JSON object. Nothing prompts when stdin or
stdout isn't a terminal, or when you pass options. `cineblock help agents` has the full guide.

```sh
export CINEBLOCK_TOKEN=cb_...
cineblock status --json
cineblock guided --signal "plot twist" --language en --era 2010s --json
cineblock list watched --limit 100 --json
```

### JSON output (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "guided",
  "filters": { "keywordId": 3801, "languages": ["en"], "yearFrom": 2010, "yearTo": 2019 },
  "quota": { "used": 4, "remaining": 11, "limit": 15, "resetsAt": "2026-11-21T00:00:00.000Z" },
  "results": [
    {
      "tmdbId": 27205,
      "title": "Inception",
      "year": 2010,
      "rating": 8.4,
      "overview": "Cobb, a skilled thief who commits corporate espionage...",
      "genres": ["Action", "Science Fiction", "Adventure"],
      "reason": null,
      "url": "https://www.cineblock.in/movie/inception-27205"
    }
  ]
}
```

`ai` returns `query` instead of `filters`, and `reason` holds the AI's one-line pitch. Other
commands: `status` returns `account`, `quota` and `ai`; `list` returns `list`, `total` and `items`;
`options` returns `signals`, `languages` and `eras`; `open` returns `url` and `opened`.

Errors are JSON too:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "guided",
  "error": { "code": "QUOTA_EXCEEDED", "message": "You've used all of today's searches.", "hint": "...", "exitCode": 4 }
}
```

Fields are only ever added within a schema version.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected error |
| 2 | Bad command or option |
| 3 | Not signed in, or the CLI token was refused |
| 4 | Daily searches used up |
| 5 | CineBlock unreachable, busy or failing |
| 6 | AI key missing or the AI provider failed |
| 7 | The search found nothing |
| 130 | Stopped with Ctrl+C |

### Environment

| Variable | Purpose |
| --- | --- |
| `CINEBLOCK_TOKEN` | CLI token for this run, overrides the saved one |
| `CINEBLOCK_AI_KEY` | AI key for this run, overrides the saved one |
| `CINEBLOCK_CONFIG_DIR` | Where to keep `config.json` |
| `CINEBLOCK_AI_MODEL` | AI model to use instead of the provider default |
| `CINEBLOCK_API_URL` | Point at another CineBlock deployment (https, or http for localhost) |
| `NO_COLOR` / `FORCE_COLOR` | Turn colour off or on |

## Upgrading from 1.x

Version 2 drops terminal poster images, which made installs heavy and slow, in favour of
compact text cards. Your saved token and AI key move from the old plain-text config into the
keychain the first time you run 2.x, and the old file is deleted.

## Development

```sh
npm install
npm test
node bin/cineblock.js --help
```

The code lives in `src/`: `cli.js` parses arguments and reports errors, `commands.js` holds the
command handlers, `interactive.js` the prompts, `api.js` the CineBlock web API, `search.js` the
quota and reroll rules, `guided.js` the website's three questions, `ai.js` the AI providers,
`credentials.js` the keychain and config file, and `render.js` the text and JSON output.

## License

MIT © CineBlock
