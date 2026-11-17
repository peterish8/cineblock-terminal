# 🌌 CineBlock CLI — AI or Guided Movie Search

[![NPM Version](https://img.shields.io/npm/v/cineblock.svg?style=flat-square)](https://www.npmjs.com/package/cineblock)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**CineBlock Terminal** is a high-performance terminal movie finder with two separate modes: describe what you want in natural language with your own AI key, or answer the same three filter questions as CineBlock’s website without using AI.

---

## ✨ Features

*   **🧠 AI Search**: Supports **Google Gemini**, **Groq**, and **OpenRouter** for natural-language recommendations.
*   **🎛 Guided Search**: Story signal, original language, and release era produce five server-ranked results with no AI key.
*   **🔐 Separate CLI authentication**: The `cb_...` CLI token is only for terminal movie search and its daily quota. It is not an MCP token.
*   **📸 High-Res Sixel Graphics**: Optimized specifically for **Windows Terminal (v1.22+)**. Renders crisp, photo-quality posters using the Sixel protocol.
*   **🍱 Battle-Hardened TUI**: A beautiful Neobrutalist design with interactive prompts, clean layouts, and rich color palettes.
*   **⚡ Faster-than-Light Search**: Powered by the CineBlock API proxy and `sharp` for professional-grade image processing inside your terminal.

---

## 🚀 Quick Start

### 1. Installation
Install the CLI globally via npm:

```bash
npm install -g cineblock
```

### 2. Launch
Simply type `cineblock` in your terminal to begin.

```bash
cineblock
```

---

## 🛠️ Configuration

The terminal first asks for your **CineBlock CLI token**. Generate it from CineBlock → Profile → CineBlock Terminal. This is separate from the `mcp_...` token used by ChatGPT/MCP.

AI mode optionally asks for an **AI API Key**. Guided mode never asks for one. You can use:
- **Google Gemini**: Get a free key from [Google AI Studio](https://aistudio.google.com/).
- **Groq**: Lightning-fast inference from [Groq Cloud](https://console-groq.com/).
- **OpenRouter**: Access any model via [OpenRouter](https://openrouter.ai/).

> [!TIP]
> Choose Guided no-AI search if you do not want to configure an AI provider. Use the mode menu to update the CLI token or AI key.

## 🔐 CLI token vs MCP token

| Credential | Prefix | Used for | Where it is used |
|---|---|---|---|
| CLI token | `cb_...` | Terminal movie search and the 15-search daily quota | CineBlock Terminal only |
| MCP token | `mcp_...` | ChatGPT access to library reads, playlist previews/writes, and stamps | ChatGPT/custom MCP connector only |

Never paste the MCP token into the terminal and never use the CLI token as a ChatGPT connector credential.

---

## 🌗 Sixel Graphics (Pro Mode)

To get the absolute sharpest visual experience on **Windows Terminal**:

1.  **Ensure you are on v1.22+**: `winget upgrade Microsoft.WindowsTerminal`
2.  **Font size matters**: Lower your terminal font size to **11pt or 12pt** in Settings → Appearance. This makes the pixels smaller and the image "Retina-sharp."
3.  **Automatic Detection**: CineBlock automatically detects your terminal capability and switches from block characters to high-res Sixel mode if supported.

---

## 📦 Dependencies
- **UI Engine**: `inquirer`, `ora`, `chalk`, `figlet`
- **Graphics Engine**: `sharp`, `sixel`, `terminal-image`
- **Metadata**: [TMDB](https://www.themoviedb.org/) & [CineBlock API](https://cineblock.in)

---

## 📄 License
MIT © CineBlock. Optimized with ❤️ for the terminal.
