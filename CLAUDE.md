# CineBlock Terminal — Claude project memory

Last reviewed: 2026-08-22

## Purpose

CineBlock Terminal is the standalone Node.js CLI for finding five movie suggestions. It is intentionally separate from CineBlock’s ChatGPT/MCP integration.

- Production website: https://www.cineblock.in
- Web repository: `C:\Users\nithy\Desktop\1 prats projects\movieX`
- This folder is the CLI source of truth.
- Runtime: Node.js ESM (`type: module`), Inquirer prompts, CineBlock/TMDB APIs, optional provider SDKs, and terminal poster rendering.

## Credential boundaries

- `cb_...` is the CLI token. Generate it in CineBlock → Profile → CineBlock Terminal. It is sent to `/api/cli`, is required for terminal searches, and is subject to the 15-search daily quota.
- `mcp_...` is the separate ChatGPT/MCP credential. It belongs in the MCP connector, never in this CLI.
- AI provider keys are user-owned and optional. They are needed only for AI natural-language search and are never sent to CineBlock.

Never print, commit, or place any of these credentials in source, documentation, screenshots, or error logs.

## Search contract

The CLI offers two search modes:

1. AI natural-language search: the user describes a movie, the selected Gemini/Groq/OpenRouter provider suggests candidates, and CineBlock verifies the result against poster-backed metadata.
2. Guided no-AI search: the CLI asks the same three questions as the website finder—story signal, original language, and release era—then calls `POST https://cineblock.in/api/find-movie`. The endpoint returns five server-ranked results without an AI key.

Both modes show poster-backed results. A CLI token is validated once per search; rerolling within the same search uses the existing quota grant and excludes already shown results.

## Important files

- `index.js` — startup, mode menu, token/key setup, quota flow, rerolls.
- `lib/ui.js` — prompts, the three guided questions, help, and controls.
- `lib/cineblock.js` — CLI token API calls.
- `lib/tmdb.js` — AI verification and the website-compatible guided search call.
- `lib/ai.js` plus provider files — optional AI provider dispatch.
- `lib/config.js` — local config storage through `conf`; do not expose stored values.
- `lib/display.js` — terminal poster/result rendering.

## Local verification

```text
npm install
node --check index.js
node --check lib/ui.js
node --check lib/tmdb.js
node index.js
```

Use the project-local Node executable when the global Windows npm launcher is broken. Live search smoke tests must use non-secret inputs and must not print bearer tokens.

## Change discipline

Preserve existing user changes. Keep the CLI and web/MCP contracts separate. Reuse the website’s `/api/find-movie` contract for Guided mode instead of duplicating ranking logic. Keep the result cap at five, retain exact IDs/poster metadata, and report typecheck, syntax, live endpoint, and interactive verification separately.
