# CineBlock Terminal agent contract

Read `CLAUDE.md` before editing. This repository is the standalone `cineblock` CLI published to
npm. It is not the ChatGPT/Claude MCP server.

## Calling the CLI as an agent

Run `cineblock help agents` for the full contract. In short: set `CINEBLOCK_TOKEN`, always pass
`--json`, read one object from stdout, branch on `ok` and the exit code, and remember each `guided`
or `ai` call spends one of the user's 15 daily searches.

## Working in this repository

- Preserve unrelated staged and unstaged work.
- `cb_...` tokens are only for `/api/cli` routes and terminal search, quota and library reads.
- `mcp_...` credentials never belong here. The CLI must keep refusing them with a clear message.
- AI mode may use a user-provided Gemini, Groq or OpenRouter key. Guided mode must work without one.
- Guided mode must keep the website's three questions (story signal, language, release era),
  their labels and IDs, and call `/api/find-movie` so results stay server-ranked and capped at five.
- Never log, print or put in test fixtures a real token or AI key.
- Keep user-facing copy plain, human and free of em dashes. A test enforces the dash rule.
- Keep startup light: no new runtime dependency without a strong reason, and import heavy code
  lazily (prompts load only in interactive mode).
- The JSON output schema and exit codes are a public contract. Only add fields; bump
  `schemaVersion` for anything else, and update `src/help.js` and `README.md` together.
- Verify with `npm test` and report live, interactive and unit checks separately.
