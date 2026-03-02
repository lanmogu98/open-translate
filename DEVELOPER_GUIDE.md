# Developer Guide

This document outlines the architecture, coding standards, and documentation maintenance protocols for the **Open Translate** project.

## Purpose & Development Model

1.  **Agent-first development (95%+)**: This product is developed **95%+** by LLM agents. Humans focus on product direction; design, implementation, and tests are produced by the agents.
2.  **Primary purpose of this guide**: Provide interested developers a **fast, high-signal entrypoint** to understand the project's current state (architecture, constraints, and how to run/verify).
3.  **Evolving workflow contract**: Agent work in this repo is managed via centralized skills at `~/.claude/skills/`.

## Project Structure

```text
/
├── manifest.json        # Chrome Extension manifest (MV3)
├── llm_config.yml       # ★ Single source of truth for LLM providers/models
├── scripts/
│   └── build-config.js  # Converts llm_config.yml → JSON + generated JS
├── src/
│   ├── background.js      # Service Worker: Handles API Proxying & Tab events
│   ├── content.js         # Content Script: Core logic (Scanning, Batching, Messaging)
│   ├── content.css        # Styles for the injected translation nodes
│   ├── popup/             # Browser action popup UI
│   ├── options/           # Settings UI (Provider/Model, API Key, Language, Exclusions)
│   ├── pdf-viewer/        # PDF redirect entry + viewer placeholder (PDF.js integration planned)
│   └── utils/
│       ├── dom-utils.js           # Pure DOM manipulation helpers
│       ├── llm-client.js          # Bridge between Content Script and Background Service
│       ├── prompt-templates.js    # Protocol prompt + user prompt combiner (UMD-style)
│       ├── model-registry.js      # Provider/model registry (reads from llm-config.generated.js)
│       ├── llm-config.generated.js  # ★ Auto-generated from llm_config.yml (do not edit)
│       ├── richtext-v2.js         # Rich text tokenization/rendering (v2)
│       ├── lang-detect.js         # Simple source-language heuristic (UMD-style)
│       └── translation-cache.js   # LRU translation cache utility (UMD-style)
├── tests/                 # Jest unit tests (jsdom + chrome mocks)
├── jest.config.cjs        # Jest configuration
└── package.json           # Dev dependencies + test/build scripts
```

## First-time Setup (Bootstrap)

Some runtime config files are **generated** and ignored by git. After cloning:

```bash
npm install
npm run build:config
```

Then load the unpacked extension in Chrome using the repo root as the extension directory.

> Note: `npm test` automatically runs `build:config` via `pretest`.

## Architecture Principles

1.  **Safety First**: Never hardcode API Keys. Always read from `chrome.storage.sync`.
2.  **Worker-Based Concurrency**: The `content.js` uses a "Producer-Consumer" model.
    -   *Producer*: `runTranslationProcess` uses `DOMUtils.getTranslatableElements(...)` and pushes tasks to `translationQueue`.
    -   *Consumer*: `translationWorker` pulls tasks (in batches of 10 by default, configurable) and processes them.
    -   *Constraint*: Keep `MAX_CONCURRENT_WORKERS = 1` to ensure DOM stability and avoid Rate Limits.
3.  **The "Immersive Protocol"**:
    -   We do not simply ask the LLM to translate. We send a strict protocol.
    -   Separator: `\n%%\n`.
    -   The LLM **MUST** return exact paragraph correspondence separated by `%%`.
    -   The Frontend **MUST** parse this stream and distribute text to the correct nodes.
4.  **Shared Utils (No ESM)**:
    -   This repo uses classic scripts (not ES modules) so shared code can run across extension contexts.
    -   **Content scripts** are loaded in order via `manifest.json` and share the same isolated-world global scope.
    -   **Options page** loads shared utils via `<script>` tags.
    -   **Background service worker** loads selected shared utils via `importScripts(...)` when available (guarded in tests).
    -   Many utils include `module.exports` guards for Jest/Node, and some also attach APIs to `globalThis` for convenience.

## Documentation Protocol (CRITICAL)

All developers must adhere to the following rules when updating code. **Code changes without documentation updates are considered incomplete.**

### 1. Updating `README.md`
-   **When**: You change the installation process, configuration options, or major user-facing features.
-   **How**: Ensure the "Configuration" section matches the actual fields in `src/options/options.html`.

### 2. Updating `FUTURE_ROADMAP.md`
-   **When**: You start/finish a roadmap item, change priorities, or add/remove near-term tasks.
-   **How**:
    -   Keep `FUTURE_ROADMAP.md` **short and high-signal** (default entrypoint for humans + agents).
    -   Put deep implementation notes in `docs/DESIGN_REMAINING_ISSUES.md` (not in the roadmap).
    -   Move historical/long-form content to `docs/roadmap/ROADMAP_ARCHIVE.md`.

### 3. Updating `CHANGELOG.md`
-   **When**: Every time you make a commit that affects logic (Fixes, Features, Security).
-   **How**:
    -   Follow the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.
    -   Categories: `## [Unreleased]`, `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`.

### 4. Updating `DEVELOPER_GUIDE.md` (This file)
-   **When**: You change the project structure, build tools, or architectural patterns (e.g., switching from Direct Fetch to Proxy).
-   **How**: Update the "Project Structure" tree and "Architecture Principles" to reflect reality.

## Development Workflow

1.  **Design (Behavior Changes)**: Add/update Jest tests in `/tests` first when changing logic.
2.  **Make Changes**: Edit the code in `/src`.
3.  **Verify**:
    -   Run `npm test`
    -   Load the unpacked extension and test in Chrome
4.  **Document**: Update `CHANGELOG.md` immediately with what you changed.
5.  **Reflect**: If you finished a roadmap item, update its status in `FUTURE_ROADMAP.md` (and archive when appropriate).

## Updating LLM Providers/Models

The provider and model list is defined in `llm_config.yml` (single source of truth).

```bash
# 1. Edit llm_config.yml (add/remove providers or models)
# 2. Regenerate the runtime config:
npm run build:config

# 3. Reload the extension in Chrome
```

The build script generates:
- `llm_config.json` — for programmatic access and tests
- `src/utils/llm-config.generated.js` — loaded by the extension at runtime

**Note:** These generated files are in `.gitignore`. Always commit `llm_config.yml` as the source of truth.

## Testing

This repo uses **Jest + jsdom** for unit tests (no build pipeline).

```bash
npm install
npm test
```

## Security Checklist

Before checking in any code:
-   [ ] run `grep -r "sk-" .` (or your key prefix) to ensure no keys are leaked.
-   [ ] Verify `options.js` default values are empty or safe placeholders.
