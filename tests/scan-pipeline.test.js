/**
 * Scan Pipeline Spec (Issue 19 + Issue 12)
 *
 * These tests lock in the expected behavior for the scanning pipeline
 * after Issue 19 (heuristics) and Issue 12 (language gating) are implemented.
 */

describe('scan pipeline (Issue 19 + Issue 12)', () => {
  const fs = require('fs');
  const path = require('path');
  const { DOMUtils } = require('../src/utils/dom-utils.js');

  /**
   * jsdom defaults:
   * - getBoundingClientRect() returns zero dimensions
   * - innerText is incomplete and layout-dependent
   *
   * For tests covering scanning heuristics we must explicitly mock geometry.
   */
  function makeVisible(el, options = {}) {
    if (options.offsetParent !== false) {
      Object.defineProperty(el, 'offsetParent', {
        value: document.body,
        writable: true,
        configurable: true,
      });
    }
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        width: options.width ?? 120,
        height: options.height ?? 24,
        top: 0,
        left: 0,
        right: options.width ?? 120,
        bottom: options.height ?? 24,
      }),
      configurable: true,
    });
  }

  function makeAllVisible(selector) {
    document.querySelectorAll(selector).forEach(makeVisible);
  }

  describe('Issue 12: ensure lang-detect is loaded in content scripts', () => {
    test('manifest content_scripts should include src/utils/lang-detect.js BEFORE dom-utils.js', () => {
      const manifestPath = path.join(__dirname, '..', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const js = manifest.content_scripts?.[0]?.js || [];

      const idxLang = js.indexOf('src/utils/lang-detect.js');
      const idxDom = js.indexOf('src/utils/dom-utils.js');

      // Required for runtime: DOMUtils can optionally consult LangDetect via globalThis.
      expect(idxLang).toBeGreaterThanOrEqual(0);
      expect(idxDom).toBeGreaterThanOrEqual(0);
      expect(idxLang).toBeLessThan(idxDom);
    });
  });

  describe('Issue 19: smarter scanning heuristics', () => {
    test('should include position:fixed content with visible geometry', () => {
      document.body.innerHTML = `
        <p id="fixed" style="position: fixed;">Fixed article paragraph that should be translated.</p>
      `;
      makeVisible(document.getElementById('fixed'), { offsetParent: false });

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      expect(elements.find((e) => e.element.id === 'fixed')).toBeDefined();
    });

    test('should extract DOM textContent for content hidden until expansion', () => {
      document.body.innerHTML = `
        <p id="delayed">
          <span hidden>
            Delayed    documentation
            content should be translated after expansion.
          </span>
        </p>
      `;
      const delayed = document.getElementById('delayed');
      makeVisible(delayed);
      Object.defineProperty(delayed, 'innerText', {
        get() {
          return '';
        },
        configurable: true,
      });

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });
      const result = elements.find((e) => e.element.id === 'delayed');

      expect(result).toBeDefined();
      expect(result.text).toBe('Delayed documentation content should be translated after expansion.');
    });

    test('should include containers whose text lives only in inline children', () => {
      document.body.innerHTML = `
        <main>
          <div id="inlineDiv"><span>Inline documentation intro</span> <a href="#">with reference links</a></div>
          <section id="inlineSection"><span>Section text composed only from inline children</span></section>
        </main>
      `;
      makeAllVisible('main, div, section, span, a');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      expect(elements.find((e) => e.element.id === 'inlineDiv')).toBeDefined();
      expect(elements.find((e) => e.element.id === 'inlineSection')).toBeDefined();
    });

    test('should not include parent section when child section is selected', () => {
      document.body.innerHTML = `
        <main>
          <section id="outer">
            <section id="inner"><span>Nested section text should be translated once.</span></section>
          </section>
        </main>
      `;
      makeAllVisible('main, section, span');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      expect(elements.find((e) => e.element.id === 'outer')).toBeUndefined();
      expect(elements.find((e) => e.element.id === 'inner')).toBeDefined();
    });

    test('should preserve parent section inline text when child section is selected', () => {
      document.body.innerHTML = `
        <main>
          <section id="outer">
            <span>Parent inline intro should also be translated.</span>
            <section id="inner"><span>Nested section text should be translated once.</span></section>
          </section>
        </main>
      `;
      makeAllVisible('main, section, span');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      expect(elements.find((e) => e.element.id === 'outer')).toBeUndefined();
      expect(elements.find((e) => e.element.id === 'inner')).toBeDefined();
      expect(elements.filter((e) => e.text === 'Parent inline intro should also be translated.')).toHaveLength(1);
    });

    test('should include short text inside <main> (lower threshold)', () => {
      document.body.innerHTML = `
        <main>
          <p id="short">Yes</p>
          <p id="long">This is a longer paragraph that should definitely be translated.</p>
        </main>
      `;
      makeAllVisible('main, p');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        translateShortTexts: false,
        translateNavigation: false,
      });

      // New behavior (Issue 19): include short main-content text.
      expect(elements.find((e) => e.element.id === 'short')).toBeDefined();
      expect(elements.find((e) => e.element.id === 'long')).toBeDefined();
    });

    test('should skip navigation area even when text is long (default)', () => {
      document.body.innerHTML = `
        <nav>
          <ul>
            <li id="navitem">Navigation Item Long Enough</li>
          </ul>
        </nav>
        <main>
          <p id="mainp">Main content that is long enough.</p>
        </main>
      `;
      makeAllVisible('nav, ul, li, main, p');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        translateNavigation: false,
      });

      // New behavior (Issue 19): default skip nav/header/footer/aside.
      expect(elements.find((e) => e.element.id === 'navitem')).toBeUndefined();
      expect(elements.find((e) => e.element.id === 'mainp')).toBeDefined();
    });

    test('should include aside content only when translateAside is enabled', () => {
      document.body.innerHTML = `
        <aside>
          <p id="asidep">Documentation sidebar note that should be optional.</p>
        </aside>
        <main>
          <p id="mainp">Main content that is long enough.</p>
        </main>
      `;
      makeAllVisible('aside, main, p');

      const defaultElements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });
      const asideElements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        translateAside: true,
      });

      expect(defaultElements.find((e) => e.element.id === 'asidep')).toBeUndefined();
      expect(asideElements.find((e) => e.element.id === 'asidep')).toBeDefined();
      expect(asideElements.find((e) => e.element.id === 'mainp')).toBeDefined();
    });

    test('should include header and footer content only when translateHeaderFooter is enabled', () => {
      document.body.innerHTML = `
        <header>
          <p id="headerp">Documentation header summary that should be optional.</p>
        </header>
        <footer>
          <p id="footerp">Documentation footer appendix that should be optional.</p>
        </footer>
      `;
      makeAllVisible('header, footer, p');

      const defaultElements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });
      const chromeElements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        translateHeaderFooter: true,
      });

      expect(defaultElements.find((e) => e.element.id === 'headerp')).toBeUndefined();
      expect(defaultElements.find((e) => e.element.id === 'footerp')).toBeUndefined();
      expect(chromeElements.find((e) => e.element.id === 'headerp')).toBeDefined();
      expect(chromeElements.find((e) => e.element.id === 'footerp')).toBeDefined();
    });

    test('should skip elements inside interactive UI (button)', () => {
      document.body.innerHTML = `
        <button>
          <div id="btnDiv">Click here to submit and continue</div>
        </button>
        <p id="p">This paragraph is long enough to translate.</p>
      `;
      makeAllVisible('button, div, p');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      // New behavior (Issue 19): anything inside interactive controls is skipped.
      expect(elements.find((e) => e.element.id === 'btnDiv')).toBeUndefined();
      expect(elements.find((e) => e.element.id === 'p')).toBeDefined();
    });
  });

  describe('Custom elements support (body-text)', () => {
    test('should scan body-text custom element used by sites like The Economist', () => {
      document.body.innerHTML = `
        <main>
          <body-text id="bt">This is article content inside a body-text custom element that should be translated.</body-text>
          <p id="regular">Regular paragraph content.</p>
        </main>
      `;
      makeAllVisible('main, body-text, p');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      // body-text custom element should be captured
      expect(elements.find((e) => e.element.id === 'bt')).toBeDefined();
      expect(elements.find((e) => e.element.id === 'regular')).toBeDefined();
    });

    test('should NOT scan parent div when it contains body-text children (prevent duplicate)', () => {
      // Simulates The Economist DOM structure
      document.body.innerHTML = `
        <main>
          <div class="article-text" id="container">
            <body-text id="bt1">First paragraph with enough content to translate.</body-text>
            <body-text id="bt2">Second paragraph with enough content to translate.</body-text>
          </div>
        </main>
      `;
      makeAllVisible('main, div, body-text');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      // body-text elements should be captured
      expect(elements.find((e) => e.element.id === 'bt1')).toBeDefined();
      expect(elements.find((e) => e.element.id === 'bt2')).toBeDefined();
      // Parent container should NOT be captured (would cause duplicate translation)
      expect(elements.find((e) => e.element.id === 'container')).toBeUndefined();
    });

    test('should NOT scan h2 when it contains body-text child (prevent duplicate)', () => {
      // Reproduces The Economist bug where h2 > body-text causes double translation
      document.body.innerHTML = `
        <main>
          <h2 id="heading">
            <body-text id="bt">Artificial intelligence promises to transform how and where things are made</body-text>
          </h2>
        </main>
      `;
      makeAllVisible('main, h2, body-text');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
      });

      // body-text element should be captured
      expect(elements.find((e) => e.element.id === 'bt')).toBeDefined();
      // Parent h2 should NOT be captured (would cause duplicate translation)
      expect(elements.find((e) => e.element.id === 'heading')).toBeUndefined();
    });
  });

  describe('Issue 12: language detection gating (zh target)', () => {
    afterEach(() => {
      delete globalThis.LangDetect;
    });

    test('when targetLanguage is zh-CN and LangDetect is available, should skip Chinese paragraphs', () => {
      const LangDetect = require('../src/utils/lang-detect.js');
      globalThis.LangDetect = LangDetect;

      document.body.innerHTML = `
        <p id="zh">这是一段中文文本用于测试跳过逻辑</p>
        <p id="en">This is an English paragraph long enough.</p>
      `;
      makeAllVisible('p');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        targetLanguage: 'zh-CN',
      });

      // New behavior (Issue 12): skip already-zh when translating to zh-*.
      expect(elements.find((e) => e.element.id === 'zh')).toBeUndefined();
      expect(elements.find((e) => e.element.id === 'en')).toBeDefined();
    });

    test('should not skip mixed technical text under the default CJK threshold', () => {
      const LangDetect = require('../src/utils/lang-detect.js');
      globalThis.LangDetect = LangDetect;

      document.body.innerHTML = `
        <p id="mixed">使用 API 接口</p>
      `;
      makeAllVisible('p');

      const elements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        targetLanguage: 'zh-CN',
      });

      expect(elements.find((e) => e.element.id === 'mixed')).toBeDefined();
    });

    test('should allow language gate threshold and switch overrides', () => {
      const LangDetect = require('../src/utils/lang-detect.js');
      globalThis.LangDetect = LangDetect;

      document.body.innerHTML = `
        <p id="mixed">使用 API 接口</p>
        <p id="zh">这是一段中文文本用于测试关闭语言门控</p>
      `;
      makeAllVisible('p');

      const strictElements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        targetLanguage: 'zh-CN',
        languageGateCJKThreshold: 0.3,
      });
      const disabledElements = DOMUtils.getTranslatableElements({
        excludedSelectors: [],
        targetLanguage: 'zh-CN',
        languageGateEnabled: false,
      });

      expect(strictElements.find((e) => e.element.id === 'mixed')).toBeUndefined();
      expect(disabledElements.find((e) => e.element.id === 'zh')).toBeDefined();
    });
  });
});
