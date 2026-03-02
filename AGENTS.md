# Open Translate — Project Context

> **Single source of truth** for all LLM agents (Claude Code reads this via `CLAUDE.md`; Codex reads it directly).
> If you need to update project context, edit **AGENTS.md** — do NOT edit `CLAUDE.md`.

## Identity

- **Product**: Open Translate (Chrome extension)
- **Purpose**: Immersive bilingual translation overlay for web pages, powered by user-supplied AI API keys
- **Tech Stack**: Chrome Extension (MV3), vanilla JS (no ESM/build), Jest + jsdom tests
- **Repo**: `lanmogu98/open-translate`

## Architecture

- **Content Script** (`src/content.js`): Producer-consumer model — scans DOM, batches paragraphs, streams translations
- **Background Service Worker** (`src/background.js`): Proxies API requests (OpenAI-compatible `/chat/completions`)
- **Shared Utils** (`src/utils/*.js`): UMD-style modules (`globalThis` + `module.exports`)
- **Config**: `llm_config.yml` → build script → `llm-config.generated.js` (gitignored)

## Key Conventions

- No ESM imports — classic `<script>` loading order matters
- API keys stored in `chrome.storage.sync`, never hardcoded
- Rich text uses Token Protocol V2 (model outputs plain text + tokens, never HTML)
- Protocol prompt is internal/non-editable; user controls only style prompt
- Tests require `offsetParent` and `innerText` mocks for jsdom

## Current State

- Version: 0.1.1 (experimental, 0.x.y series)
- All 24 test suites passing
- Agent workflow managed via centralized skills (`~/.claude/skills/`), synced from [dev-skills](https://github.com/lanmogu98/dev-skills)
