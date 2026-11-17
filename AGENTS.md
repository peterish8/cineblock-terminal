# CineBlock Terminal agent contract

Read `CLAUDE.md` before editing. This repository is the standalone movie-search CLI, not the ChatGPT/MCP server.

- Preserve unrelated staged and unstaged work.
- Keep `cb_...` CLI credentials limited to `/api/cli` and terminal search/quota.
- Keep `mcp_...` credentials out of this repository; they are for the web MCP connector only.
- AI mode may use a user-provided Gemini, Groq, or OpenRouter key. Guided mode must work without any AI key.
- Guided mode must retain the website’s three questions—story signal, language, release era—and use `/api/find-movie` so results remain server-ranked and capped at five.
- Do not log tokens or AI keys.
- Verify changed JavaScript with `node --check` and state live/interactive checks separately.
