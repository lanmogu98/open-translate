# Open Translate (Experimental)

[中文](./README.zh-CN.md)

Open Translate is a lightweight Chrome extension that provides immersive-style bilingual translation for web pages. It uses your own AI API key (DeepSeek, OpenAI, Volcengine Ark, etc.) for context-aware, high-quality translations.

## Features

- **In-place bilingual display**: Translations appear directly below each original paragraph for clear side-by-side reading.
- **Smart batching**: Paragraphs are grouped into batches (default 10, configurable) before sending to the LLM, preserving context while reducing API calls.
- **Streaming output**: Plain-text paragraphs render with a live typewriter effect; rich-text paragraphs render after full receipt to avoid style flicker.
- **Style inheritance**: Translations automatically inherit the original text's font size, weight, and alignment.
- **Rich text preservation**: A safe **Token Protocol** preserves links (`<a href>`), inline formatting (bold/italic), and Wikipedia-style footnote references (`[1]`) — the model never outputs raw HTML.
- **Privacy first**: No data passes through any relay server. Your API key is stored locally in `chrome.storage.sync`.

## Installation

> **Note**: This is an experimental project not yet published on the Chrome Web Store. Install via Developer Mode.

### Option 1: From GitHub Releases (Recommended)

1. Go to the [Releases page](https://github.com/lanmogu98/open-translate/releases)
2. Download the latest `open-translate-vX.Y.Z.zip`
3. Unzip to any directory
4. Open Chrome and navigate to `chrome://extensions`
5. Enable **Developer mode** (top-right toggle)
6. Click **Load unpacked**
7. Select the unzipped folder

### Option 2: From Source (Developers)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the repository root (the folder containing `manifest.json`)

> **Developer note**: You only need local Node/npm if you want to **modify `llm_config.yml`** (provider/model list) or run tests. See `DEVELOPER_GUIDE.md`.

## Configuration

You must configure your AI API credentials before use.

1. Click the extension icon in the browser toolbar.
2. Click **Settings** in the popup, or right-click the icon and select **Options**.
3. **Provider & Model**:
   - **Provider**: Choose an AI provider (Volcengine Ark, DeepSeek, OpenAI, or Custom).
   - **Model**: Select a model for the chosen provider.
   - **API Key**: Enter your API key (stored locally).
4. **Translation**:
   - **Target Language**: Choose the target language (default: Simplified Chinese).
   - **Style Prompt**: (Optional) Customize the translation style (e.g., "keep a professional tone"). Note: protocol controls are not editable.
5. **Exclusions (Optional)**:
   - **Excluded Domains**: Exclude specific domains (supports `*.example.com`), one per line.
   - **Excluded Selectors**: Exclude specific CSS selectors (e.g., navbars, code blocks), one per line.
6. **Advanced**:
   - If you selected the **Custom** provider, manually enter the API Endpoint and Model ID here.
7. Click **Save Settings**.

## Usage

1. Open any web page you want to translate.
2. Click the extension icon in the top-right corner.
3. Click the **Translate Page** button.
4. The extension will scan the page and stream translations paragraph by paragraph.

## Troubleshooting

- **Nothing happens when I click?**
  Check that your API Key is saved in the Settings page.
- **Can't translate the current page?**
  Browser internal pages (`chrome://settings`, `about:blank`, etc.) block content script injection for security reasons.
- **Only part of the page was translated?**
  You may have hit an API rate limit. The extension processes 10 paragraphs per batch by default (adjustable in Settings > Advanced). Wait a moment or check your quota.
- **Is my API key safe?**
  Your key is stored only in your browser's local storage (`chrome.storage.sync`). It is never uploaded to any server or hardcoded in the source.

## Development & Contributing

- **Agent-first development (95%+)**: Over 95% of this codebase was written by LLM agents. Humans define product direction and review; agents handle design, implementation, and testing.
- **Agent workflow**: Governed by centralized Skills (`~/.claude/skills/`), synced from [dev-skills](https://github.com/lanmogu98/dev-skills).
- **Developer guide**: See `DEVELOPER_GUIDE.md` for architecture, constraints, and how to run validation.

Run unit tests:

```bash
npm install
npm test
```
