# 剩余项目设计文档

本文档描述 `FUTURE_ROADMAP.md` 中尚未完成的 Issue 的实现路径、技术方案和测试计划。

---

## ⚙️ 项目约束（影响实现方式与测试方式）

- **无构建工具 / 非 ESM**：当前 Options 页与 content scripts 都是直接用 `<script>` 加载；`background.js` 为 MV3 service worker。设计与代码示例需要遵循这一约束（不能直接用 `import ... from ...`）。
- **共享模块（推荐 UMD 风格）**：新增 `src/utils/*.js` 建议同时满足：
  - **扩展运行时**：将 API 挂到 `globalThis`（例如 `globalThis.PromptTemplates = {...}`），这样在 window（Options/Content）与 service worker（Background）里都可用。
  - **Node/Jest 测试**：用 `module.exports` 导出同一套 API（例如 `if (typeof module !== 'undefined' && module.exports) module.exports = {...}`）。
- **加载顺序（非常关键）**：
  - **Options 页**：在 `options.html` 中先加载 utils，再加载 `options.js`（例如：`<script src="../utils/prompt-templates.js"></script>`）。
  - **Background SW**：在 `background.js` 顶部使用 `importScripts('src/utils/prompt-templates.js')`（以及其他 utils），避免重复定义与漂移。
  - **Content scripts**：在 `manifest.json` 的 `content_scripts[].js` 列表里把 utils 放在 `src/content.js` 之前，确保 `globalThis.*` 已初始化。
- **Jest/jsdom 注意事项（避免"真空通过"）**：
  - `jsdom` 默认 `offsetParent === null`，且 `innerText` 支持不完整；凡是测试 `DOMUtils.getTranslatableElements()` 或可见性/文本抽取逻辑的用例，必须显式 mock `offsetParent` 与 `innerText`，否则很容易出现"无论实现如何都通过"的假覆盖。

---

## 📝 待实现的需求（Pending Items）

### Issue 31b: 智能批量回退（Smart Batch Fallback - Token Limits）

| 项目 | 内容 |
|------|------|
| **需求** | 根据模型的 context_window / max_tokens 限制，自动检测并回退 batch size |
| **优先级** | P2 - Medium（依赖 31a 完成 ✅） |
| **当前状态** | `llm_config.yml` 已包含每个 provider-model 的 `context_window` 和 `max_tokens` |
| **改动文件** | 新建 `src/utils/batch-calculator.js`, `src/content.js`（集成）, `manifest.json`（content_scripts 加载顺序） |
| **Fallback 序列** | `[userValue, 10, 5, 3, 1].filter(n => n <= userValue).sort(desc)` |
| **测试计划** | - 单测 `BatchCalculator.estimateTokens()` 的准确性<br>- 单测 `calculateSafeBatchSize()` 的fallback逻辑<br>- 集成测试：使用超长段落触发fallback |

---

### Issue 13: 翻译缓存（Translation Caching）

| 项目 | 内容 |
|------|------|
| **需求** | 缓存已翻译内容，减少 API 调用 |
| **优先级** | P3 |
| **改动文件** | `src/utils/translation-cache.js`（新建）, `src/content.js` |
| **方案** | LRU Map (maxSize=1000), key = `targetLang:modelName:promptVersion:textHash` |
| **测试计划** | - 缓存命中时不调用 LLM<br>- LRU 淘汰<br>- 不同目标语言使用不同缓存条目 |

---

## 🧪 测试实现注意事项

- **避免"假通过"**：不要使用 `expect(true).toBe(true)` 作为占位；未实现的测试用例统一使用 `test.todo(...)`（或 `test.skip(...)` 并注明原因），确保"通过"代表真的测到了行为。
- **jsdom 兼容**：涉及可见性与文本抽取时，必须 mock：
  - `Object.defineProperty(el, 'offsetParent', { value: document.body })`
  - `Object.defineProperty(el, 'innerText', { get() { return this.textContent; } })`
  否则 `DOMUtils.getTranslatableElements()` 相关测试很容易不触发核心逻辑。

---

## ✅ 已完成的 Issue（归档参考）

以下 Issue 的设计文档原文已移至 `docs/roadmap/ROADMAP_ARCHIVE.md`，此处仅保留索引：

- **Issue 32**: PDF Viewer 劫持浏览器 → ✅ Done (disabled redirect, CHANGELOG 0.1.1)
- **Issue 29**: 列表项重复翻译 → ✅ Done (LEAF_CONTAINERS + hasTranslatableDescendants, CHANGELOG 0.1.1)
- **Issue 31a**: 批量大小配置 → ✅ Done (Settings Advanced, CHANGELOG 0.1.1)
- **Issue 30**: 更新扩展图标 → ✅ Done (sharp icon generation, CHANGELOG 0.1.1)
- **Issue 46**: DOM Layout Test System → ✅ Done (word divs, BR paragraphs, translation styles, CHANGELOG 0.1.1)
- **Issue 16**: RichText V2 Token 协议 → ✅ Done
- **Issue 19**: 短文本筛选策略 → ✅ Done
- **Issue 12**: 源语言检测 → ✅ Done
- **Issues 9, 15, 17, 18, 20**: Phase 1-2, 5 基础设施 → ✅ All Done
- **Issues 22, 23, 24**: Code quality → ✅ All Done
- **Issues 38-44**: Security Sprint → ✅ All Done
- **Issues 47-50**: Translation Quality + Settings UX → ✅ All Done
