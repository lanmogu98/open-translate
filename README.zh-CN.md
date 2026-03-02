# Open Translate (沉浸式翻译克隆 - 实验性)

[English](./README.md)

Open Translate 是一个轻量级的 Chrome 扩展，为网页提供"沉浸式翻译"风格的双语对照。你使用自己的 AI API Key（如 DeepSeek, OpenAI, Volcengine Ark 等）进行上下文感知的高质量翻译。

## 功能特性

- **就地双语显示**: 在原段落下方直接展示译文，形成清晰对照。
- **智能分段批量**: 自动将段落分批（默认 10 段/批，可在设置中调整）发送给 LLM，既保留了上下文，又减少了 API 请求次数。
- **流式渲染**: 纯文本段落会实时打字机式输出；富文本段落则在完整接收后渲染，避免样式闪烁。
- **样式继承**: 译文自动继承原文的字号、字重与对齐方式，保持页面美观。
- **富文本保留**: 通过安全的 **Token 协议**，完美保留链接 (`<a href>`)、行内格式（加粗/斜体）和 Wikipedia 风格的脚注引用（`[1]`），模型绝不输出 HTML。
- **隐私优先**: 所有数据不经过中转服务器。你的 API Key 安全保存在浏览器的 `chrome.storage.sync` 中。

## 安装指南

> **注意**: 这是一个实验性项目，尚未上架 Chrome 应用商店。需要通过"开发者模式"安装。

### 方式一：从 GitHub Releases 安装（推荐）

1. 前往 [Releases 页面](https://github.com/lanmogu98/open-translate/releases)
2. 下载最新版本的 `open-translate-vX.Y.Z.zip`
3. 解压 zip 文件到任意目录
4. 打开 Chrome 浏览器，进入 `chrome://extensions`
5. 打开右上角的 **开发者模式 (Developer mode)** 开关
6. 点击 **加载已解压的扩展程序 (Load unpacked)**
7. 选择刚才解压的文件夹

### 方式二：从源码安装（开发者）

1. 克隆或下载本仓库到本地
2. 打开 Chrome 浏览器，进入 `chrome://extensions`
3. 打开右上角的 **开发者模式** 开关
4. 点击 **加载已解压的扩展程序**
5. 选择仓库根目录（包含 `manifest.json` 的文件夹）

> **开发者说明**: 只有在你需要**修改 `llm_config.yml`（提供商/模型列表）**或运行测试时，才需要本地 Node/npm。详见 `DEVELOPER_GUIDE.md`。

## 配置 (Config)

使用前，你必须配置 AI API 凭证。

1. 点击浏览器工具栏里的扩展图标。
2. 点击弹窗中的 **Settings**，或者右键图标选择 **选项 (Options)**。
3. **Provider & Model (提供方与模型)**:
   - **Provider**: 选择 AI 提供商（支持 Volcengine Ark, DeepSeek, OpenAI, 或自定义）。
   - **Model**: 选择该提供商下的模型。
   - **API Key**: 填入你的 API 密钥（将保存在本地）。
4. **Translation (翻译设置)**:
   - **Target Language**: 选择目标语言（默认：简体中文）。
   - **Style Prompt**: (可选) 自定义翻译风格提示词（例如"保持专业语气"）。注意：协议控制符不可修改。
5. **Exclusions (排除规则 - 可选)**:
   - **Excluded Domains**: 排除特定域名（支持 `*.example.com`），每行一个。
   - **Excluded Selectors**: 排除特定 CSS 选择器（如导航栏、代码块），每行一个。
6. **Advanced (高级)**:
   - 如果选择 **Custom** 提供商，可以在此手动输入 API Endpoint 和 Model ID。
7. 点击 **Save Settings** 保存。

## 使用说明

1. 打开任意你想翻译的英文网页。
2. 点击浏览器右上角的扩展图标。
3. 点击 **Translate Page** 按钮。
4. 扩展将开始扫描页面，并按段落顺序流式显示译文。

## 常见问题 (Troubleshooting)

- **点击没反应？**
  请检查设置页是否已保存 API Key。
- **无法翻译当前页面？**
  浏览器内部页面（如 `chrome://settings`, `about:blank`）出于安全原因不允许注入翻译脚本。
- **只翻译了一部分？**
  可能触发了 API 限流。扩展默认每批处理 10 个段落（可在设置 → 高级中调整），请稍作等待或检查配额。
- **关于安全？**
  API Key 仅保存在你的浏览器本地 (`chrome.storage.sync`)，绝不会上传到任何服务器，也不会硬编码在源码中。

## 开发与贡献

- **Agent-first 开发模式 (99%+)**: 本产品 **99%** 以上的代码由 LLM Agent 编写。人类主要负责定义产品方向与 Review；设计、实现和测试均由 Agent 完成。
- **Agent 工作流规范**: 通过集中管理的 Skills 系统约束 Agent 行为（`~/.claude/skills/`），Skills 源自 [dev-skills](https://github.com/lanmogu98/dev-skills) 仓库。
- **开发者入口**: 请阅读 `DEVELOPER_GUIDE.md` 了解架构、约束及如何运行验证。

运行单元测试:

```bash
npm install
npm test
```
