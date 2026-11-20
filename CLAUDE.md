# CineBlock Terminal: Claude project memory

Last reviewed: 2026-11-20

@AGENTS.md

## Purpose

CineBlock Terminal is the `cineblock` npm package: a Node.js CLI that finds five movies, shows the
user's quota and lists, and opens titles on cineblock.in. It is separate from CineBlock's
ChatGPT/Claude MCP integration.

- Production website and API: https://www.cineblock.in
- Web and API repository: `C:\Users\nithy\Desktop\1 prats projects\movieX`
- Runtime: Node.js 20.12+, ESM, `@inquirer/prompts` (lazy, interactive only), optional
  `@napi-rs/keyring` for the OS keychain. Everything else is the standard library.

## Credential boundaries

- `cb_...` is the CLI token from CineBlock Profile. Sent only to `/api/cli` and `/api/cli/library`.
  15 searches per UTC day.
- `mcp_...` is the separate ChatGPT/Claude MCP credential. Refused by `validateCliToken`.
- AI provider keys are user-owned, optional, sent only to the provider, never to CineBlock.
- Storage order: env (`CINEBLOCK_TOKEN`, `CINEBLOCK_AI_KEY`), OS keychain, then a 0600
  `config.json`. 1.x plain-text config is migrated and deleted on first run.

## Search contract

- Guided: the website's three questions, `POST /api/find-movie`, five results, same
  personalization body as the website when the story signal is "any".
- AI: provider suggests titles, `GET /api/movies?action=search` verifies them, up to five.
- One search spends quota once (`POST /api/cli`); rerolls in the same search are free and exclude
  shown titles. AI calls the provider before spending quota.

## Files

- `bin/cineblock.js`: shebang entry, calls `run()`.
- `src/cli.js`: argument parsing, app context, error reporting, exit codes. `run()` is injectable.
- `src/commands.js`: command handlers. `src/interactive.js`: menu and prompts.
- `src/api.js`: CineBlock HTTP client and error mapping. `src/search.js`: quota and reroll rules.
- `src/guided.js`: website question catalog. `src/ai.js`: providers. `src/credentials.js`: storage.
- `src/render.js`: cards and JSON envelopes. `src/term.js`: colour, wrapping, spinner.
- `src/help.js`: all help text, including `help agents` (with the JSON schema) and `help exit-codes`.
- `test/`: `node:test` suite, including a fake-terminal test that drives the real prompts.

## Verification

```text
npm test
node bin/cineblock.js --help
npm pack --dry-run
```

Live checks need a valid `cb_` token and spend real searches; say which were run.
