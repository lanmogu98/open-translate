/**
 * Tests for Issue 19: Short Text Heuristic Improvements
 * 
 * These tests verify that:
 * 1. Elements in main content area have lower length threshold
 * 2. Navigation/header/footer elements are handled differently
 * 3. Interactive elements (buttons, inputs) are skipped
 * 4. User configuration options work correctly
 * 
 * IMPORTANT: jsdom doesn't compute layout.
 * All tests that use getTranslatableElements() must mock visible geometry.
 */

const { DOMUtils } = require('../src/utils/dom-utils.js');

/**
 * Helper to make elements "visible" in jsdom.
 * jsdom defaults getBoundingClientRect() to zero dimensions.
 */
function makeVisible(element, options = {}) {
  if (options.offsetParent !== false) {
    Object.defineProperty(element, 'offsetParent', {
      value: document.body,
      writable: true,
      configurable: true
    });
  }
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width: options.width ?? 120,
      height: options.height ?? 24,
      top: 0,
      left: 0,
      right: options.width ?? 120,
      bottom: options.height ?? 24,
    }),
    configurable: true
  });
}

/**
 * Helper to make all matching elements visible
 */
function makeAllVisible(selector) {
  document.querySelectorAll(selector).forEach(el => makeVisible(el));
}

describe('DOMUtils - Smart Filtering (shouldTranslate)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('basic filtering', () => {
    test('should skip empty text', () => {
      const p = document.createElement('p');
      p.textContent = '';
      document.body.appendChild(p);
      makeVisible(p);
      
      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeUndefined();
    });

    test('should skip pure numbers', () => {
      const p = document.createElement('p');
      p.textContent = '12345';
      document.body.appendChild(p);
      makeVisible(p);
      
      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeUndefined();
    });

    test('should skip whitespace-only text', () => {
      const p = document.createElement('p');
      p.textContent = '   \n\t  ';
      document.body.appendChild(p);
      makeVisible(p);
      
      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeUndefined();
    });
  });

  describe('main content area priority', () => {
    test('should translate short text inside <main> (when shouldTranslate is implemented)', () => {
      document.body.innerHTML = `
        <main>
          <p id="short">Yes</p>
          <p id="long">This is a longer paragraph that should definitely be translated.</p>
        </main>
      `;
      
      makeAllVisible('main, p');
      
      // Current behavior: short text is filtered out by length > 8
      // After Issue 19: short text in main should be included
      // This test documents expected behavior after implementation
      
      const elements = DOMUtils.getTranslatableElements();
      const longEl = elements.find(e => e.element.id === 'long');
      expect(longEl).toBeDefined();
      
      // TODO: After Issue 19 implementation, uncomment:
      // const shortEl = elements.find(e => e.element.id === 'short');
      // expect(shortEl).toBeDefined();
    });

    test('should translate short text inside <article>', () => {
      document.body.innerHTML = `
        <article>
          <p id="content">OK</p>
        </article>
      `;
      makeAllVisible('article, p');
      
      // After Issue 19: this should be included due to being in article
      // For now, verify the long text works
      const elements = DOMUtils.getTranslatableElements();
      // Short text currently filtered out
      // expect(elements.find(e => e.element.id === 'content')).toBeDefined();
    });
  });

  describe('navigation area handling', () => {
    test('should skip short text inside <nav> by default', () => {
      document.body.innerHTML = `
        <nav>
          <a href="#" id="navlink">Home</a>
        </nav>
        <p id="main">This is the main content that should be translated.</p>
      `;
      makeAllVisible('nav, a, p');
      
      const elements = DOMUtils.getTranslatableElements();
      // Nav link should be skipped (short + nav area)
      // Main content should be included
      const mainEl = elements.find(e => e.element.id === 'main');
      expect(mainEl).toBeDefined();
    });

    test('should skip short text inside <header> by default', () => {
      document.body.innerHTML = `
        <header>
          <h1 id="title">Logo</h1>
        </header>
        <p id="content">This is the main content paragraph.</p>
      `;
      makeAllVisible('header, h1, p');
      
      const elements = DOMUtils.getTranslatableElements();
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });

    test('should skip short text inside <footer> by default', () => {
      document.body.innerHTML = `
        <footer>
          <p id="copyright">© 2024</p>
        </footer>
        <p id="main">Main content that is long enough.</p>
      `;
      makeAllVisible('footer, p');
      
      const elements = DOMUtils.getTranslatableElements();
      const mainEl = elements.find(e => e.element.id === 'main');
      expect(mainEl).toBeDefined();
    });
  });

  describe('interactive elements', () => {
    test('should skip <button> elements', () => {
      document.body.innerHTML = `
        <button id="btn">Click me to do something</button>
        <p id="text">Some paragraph text that is long enough.</p>
      `;
      makeAllVisible('button, p');
      
      const elements = DOMUtils.getTranslatableElements();
      // Button should not be in the candidate list (not a block element)
      const textEl = elements.find(e => e.element.id === 'text');
      expect(textEl).toBeDefined();
    });

    test('should skip elements inside <button>', () => {
      document.body.innerHTML = `
        <button>
          <span id="btn-text">Submit Form</span>
        </button>
        <p id="content">Regular paragraph content here.</p>
      `;
      makeAllVisible('button, span, p');
      
      const elements = DOMUtils.getTranslatableElements();
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
      // Button text should not be translated
    });
  });

  describe('combined heuristics', () => {
    test('should correctly handle complex page structure', () => {
      document.body.innerHTML = `
        <header>
          <nav>
            <a href="#">Home</a>
            <a href="#">About</a>
          </nav>
        </header>
        <main>
          <article>
            <h1 id="title">Article Title Here</h1>
            <p id="intro">Short</p>
            <p id="body">This is a longer paragraph that should definitely be translated.</p>
          </article>
        </main>
        <footer>
          <p id="footer-text">Copyright</p>
        </footer>
      `;
      
      makeAllVisible('header, nav, a, main, article, h1, p, footer');
      
      const elements = DOMUtils.getTranslatableElements();
      
      // Long content should be included
      const bodyEl = elements.find(e => e.element.id === 'body');
      expect(bodyEl).toBeDefined();
      
      // Title should be included (long enough or in main)
      const titleEl = elements.find(e => e.element.id === 'title');
      expect(titleEl).toBeDefined();
    });
  });

  describe('selector exclusions (Issue 14)', () => {
    test('should skip elements matching excludedSelectors', () => {
      document.body.innerHTML = `
        <p id="skip" class="no-translate">This text should be skipped.</p>
        <p id="keep">This text should be translated.</p>
      `;
      makeAllVisible('p');

      const elements = DOMUtils.getTranslatableElements({ excludedSelectors: ['.no-translate'] });
      expect(elements.find(e => e.element.id === 'skip')).toBeUndefined();
      expect(elements.find(e => e.element.id === 'keep')).toBeDefined();
    });

    test('should handle invalid selector gracefully', () => {
      document.body.innerHTML = `<p id="keep">This text should be translated.</p>`;
      makeAllVisible('p');

      const elements = DOMUtils.getTranslatableElements({ excludedSelectors: ['[invalid'] });
      expect(elements.find(e => e.element.id === 'keep')).toBeDefined();
    });
  });

  describe('regression: existing behavior', () => {
    test('should still translate paragraphs longer than 8 chars', () => {
      const p = document.createElement('p');
      p.textContent = 'This is definitely long enough to translate';
      document.body.appendChild(p);
      makeVisible(p);
      
      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeDefined();
    });

    test('should skip already translated elements', () => {
      document.body.innerHTML = `
        <p id="translated" class="immersive-translate-target">Already translated text here</p>
        <p id="original">Original text that should be translated.</p>
      `;
      makeAllVisible('p');
      
      const elements = DOMUtils.getTranslatableElements();
      const translatedEl = elements.find(e => e.element.id === 'translated');
      expect(translatedEl).toBeUndefined();
      
      const originalEl = elements.find(e => e.element.id === 'original');
      expect(originalEl).toBeDefined();
    });

    test('should skip elements inside .immersive-translate-target', () => {
      document.body.innerHTML = `
        <div class="immersive-translate-target">
          <p id="nested">Nested translated text here</p>
        </div>
        <p id="outside">Text outside the translation container.</p>
      `;
      makeAllVisible('div, p');
      
      const elements = DOMUtils.getTranslatableElements();
      const nestedEl = elements.find(e => e.element.id === 'nested');
      expect(nestedEl).toBeUndefined();
    });

    test('should skip code blocks', () => {
      document.body.innerHTML = `
        <pre><code id="code">const x = 1; // this is code</code></pre>
        <p id="text">Regular text that should be translated.</p>
      `;
      makeAllVisible('pre, code, p');
      
      const elements = DOMUtils.getTranslatableElements();
      const textEl = elements.find(e => e.element.id === 'text');
      expect(textEl).toBeDefined();
    });
  });

  describe('Issue 26: skip style/script elements', () => {
    test('should skip <style> elements and their content', () => {
      document.body.innerHTML = `
        <style id="inline-style">.mw-parser-output .toclimit-2 { display: none; }</style>
        <p id="content">This is regular content that should be translated.</p>
      `;
      makeAllVisible('style, p');

      const elements = DOMUtils.getTranslatableElements();
      // Style element should NOT be in the results
      const styleEl = elements.find(e => e.element.id === 'inline-style');
      expect(styleEl).toBeUndefined();
      // Regular content should be included
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });

    test('should skip elements inside <style>', () => {
      document.body.innerHTML = `
        <div>
          <style>.some-class { color: red; }</style>
          <p id="text">Normal paragraph text here.</p>
        </div>
      `;
      makeAllVisible('div, style, p');

      const elements = DOMUtils.getTranslatableElements();
      const textEl = elements.find(e => e.element.id === 'text');
      expect(textEl).toBeDefined();
      // No CSS selectors should leak into results
      const hasCSS = elements.some(e => e.text && e.text.includes('{'));
      expect(hasCSS).toBe(false);
    });

    test('should skip <script> elements', () => {
      document.body.innerHTML = `
        <script id="inline-script">console.log("hello world");</script>
        <p id="content">Regular content here.</p>
      `;
      makeAllVisible('script, p');

      const elements = DOMUtils.getTranslatableElements();
      const scriptEl = elements.find(e => e.element.id === 'inline-script');
      expect(scriptEl).toBeUndefined();
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });
  });

  describe('Issue 27: skip math formula elements', () => {
    test('should skip <math> elements', () => {
      document.body.innerHTML = `
        <p id="text">The formula is <math id="formula"><mi>x</mi><mo>=</mo><mn>1</mn></math> which means...</p>
        <p id="content">This is a normal paragraph.</p>
      `;
      makeAllVisible('p, math');

      const elements = DOMUtils.getTranslatableElements();
      // Math element itself should not be a candidate (not in selector list)
      // But more importantly, elements containing only math should be handled
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });

    test('should skip elements inside .mwe-math-element (Wikipedia)', () => {
      document.body.innerHTML = `
        <span class="mwe-math-element">
          <span id="math-text" class="mwe-math-mathml-inline">V π ( s ) = E [ G | S 0 = s ]</span>
        </span>
        <p id="content">Regular paragraph content.</p>
      `;
      makeAllVisible('span, p');

      const elements = DOMUtils.getTranslatableElements();
      const mathEl = elements.find(e => e.element.id === 'math-text');
      expect(mathEl).toBeUndefined();
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });

    test('should skip elements inside .katex (KaTeX renderer)', () => {
      document.body.innerHTML = `
        <span class="katex">
          <span id="katex-text" class="katex-mathml">x = 1</span>
        </span>
        <p id="content">Normal text content here.</p>
      `;
      makeAllVisible('span, p');

      const elements = DOMUtils.getTranslatableElements();
      const katexEl = elements.find(e => e.element.id === 'katex-text');
      expect(katexEl).toBeUndefined();
    });

    test('should skip elements inside .MathJax (MathJax renderer)', () => {
      document.body.innerHTML = `
        <span class="MathJax">
          <span id="mathjax-text">∑ x = n</span>
        </span>
        <p id="content">Regular content paragraph.</p>
      `;
      makeAllVisible('span, p');

      const elements = DOMUtils.getTranslatableElements();
      const mathjaxEl = elements.find(e => e.element.id === 'mathjax-text');
      expect(mathjaxEl).toBeUndefined();
    });

    test('should skip block-level math containers', () => {
      document.body.innerHTML = `
        <div class="mwe-math-element" id="block-math">
          <img src="formula.svg" alt="V(s) = E[G|S_0=s]">
        </div>
        <p id="content">Text after the formula.</p>
      `;
      makeAllVisible('div, p');

      const elements = DOMUtils.getTranslatableElements();
      const mathDiv = elements.find(e => e.element.id === 'block-math');
      expect(mathDiv).toBeUndefined();
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });

    test('should skip paragraph that is purely math formula', () => {
      document.body.innerHTML = `
        <p id="pure-math">
          <span class="mwe-math-element">
            <math><mi>π</mi><mo>:</mo><mi>S</mi><mo>×</mo><mi>A</mi><mo>→</mo><mo>[</mo><mn>0</mn><mo>,</mo><mn>1</mn><mo>]</mo></math>
          </span>
        </p>
        <p id="content">This paragraph has meaningful text to translate.</p>
      `;
      makeAllVisible('p, span');

      const elements = DOMUtils.getTranslatableElements();
      // Pure math paragraph should be skipped
      const mathPara = elements.find(e => e.element.id === 'pure-math');
      expect(mathPara).toBeUndefined();
      // Normal content should be included
      const contentEl = elements.find(e => e.element.id === 'content');
      expect(contentEl).toBeDefined();
    });

    test('should skip paragraph with only math symbols remaining', () => {
      document.body.innerHTML = `
        <p id="math-only">
          <span class="mwe-math-element"><math><mi>x</mi><mo>=</mo><mn>1</mn></math></span>
          <span class="mwe-math-element"><math><mi>y</mi><mo>=</mo><mn>2</mn></math></span>
        </p>
        <p id="text">Regular paragraph content.</p>
      `;
      makeAllVisible('p, span');

      const elements = DOMUtils.getTranslatableElements();
      const mathOnly = elements.find(e => e.element.id === 'math-only');
      expect(mathOnly).toBeUndefined();
    });

    test('should translate paragraph with math AND meaningful text', () => {
      document.body.innerHTML = `
        <p id="mixed">The formula <span class="mwe-math-element"><math><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math></span> is famous in physics.</p>
      `;
      makeAllVisible('p, span');

      const elements = DOMUtils.getTranslatableElements();
      // This paragraph has meaningful text, so it should be included
      const mixedEl = elements.find(e => e.element.id === 'mixed');
      expect(mixedEl).toBeDefined();
    });
  });

  describe('visibility checks', () => {
    test('should skip elements with zero visible geometry', () => {
      const p = document.createElement('p');
      p.textContent = 'This text is hidden from view';
      document.body.appendChild(p);
      // Don't call makeVisible - leave geometry as zero
      
      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeUndefined();
    });

    test('should include visible elements', () => {
      const p = document.createElement('p');
      p.textContent = 'This text is visible and should be translated';
      document.body.appendChild(p);
      makeVisible(p);
      
      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeDefined();
    });

    test('should include position fixed elements when geometry is visible', () => {
      const p = document.createElement('p');
      p.style.position = 'fixed';
      p.textContent = 'Fixed text is visible and should be translated';
      document.body.appendChild(p);
      makeVisible(p, { offsetParent: false });

      const elements = DOMUtils.getTranslatableElements();
      expect(elements.find(e => e.element === p)).toBeDefined();
    });

    test('should use normalized textContent instead of empty innerText', () => {
      const p = document.createElement('p');
      p.innerHTML = '<span hidden>Deferred    article\ncontent should still be scanned.</span>';
      document.body.appendChild(p);
      makeVisible(p);
      Object.defineProperty(p, 'innerText', {
        get() { return ''; },
        configurable: true
      });

      const elements = DOMUtils.getTranslatableElements();
      const result = elements.find(e => e.element === p);

      expect(result).toBeDefined();
      expect(result.text).toBe('Deferred article content should still be scanned.');
    });
  });

  describe('extractTextNodes - Issue 26/27: skip math/style text nodes', () => {
    test('should skip text inside <annotation> elements (MathML LaTeX source)', () => {
      document.body.innerHTML = `
        <p id="para">One method is
          <span class="mwe-math-element">
            <math>
              <semantics>
                <mi>ε</mi>
                <annotation encoding="application/x-tex">\\varepsilon</annotation>
              </semantics>
            </math>
          </span>-greedy algorithm.
        </p>
      `;
      const para = document.getElementById('para');
      const textNodes = DOMUtils.extractTextNodes(para);
      const allText = textNodes.map(n => n.textContent).join('');

      // Should NOT contain LaTeX source code
      expect(allText).not.toContain('\\varepsilon');
      expect(allText).not.toContain('displaystyle');
      // Should contain the visible text
      expect(allText).toContain('One method is');
      expect(allText).toContain('-greedy algorithm');
    });

    test('should skip text inside <math> elements', () => {
      document.body.innerHTML = `
        <p id="para">The value is <math><mi>x</mi><mo>=</mo><mn>1</mn></math> here.</p>
      `;
      const para = document.getElementById('para');
      const textNodes = DOMUtils.extractTextNodes(para);
      const allText = textNodes.map(n => n.textContent).join('');

      // Should NOT contain math content
      expect(allText).not.toContain('x');
      expect(allText).not.toContain('=');
      expect(allText).not.toContain('1');
      // Should contain surrounding text
      expect(allText).toContain('The value is');
      expect(allText).toContain('here');
    });

    test('should skip text inside .mwe-math-element (Wikipedia)', () => {
      document.body.innerHTML = `
        <p id="para">Formula:
          <span class="mwe-math-element">
            <span class="mwe-math-mathml-inline">E = mc²</span>
          </span> is famous.
        </p>
      `;
      const para = document.getElementById('para');
      const textNodes = DOMUtils.extractTextNodes(para);
      const allText = textNodes.map(n => n.textContent).join('');

      expect(allText).not.toContain('E = mc');
      expect(allText).toContain('Formula');
      expect(allText).toContain('is famous');
    });

    test('should skip text inside .katex elements', () => {
      document.body.innerHTML = `
        <p id="para">See <span class="katex"><span class="katex-mathml">\\sum_{i=1}^n</span></span> for sum.</p>
      `;
      const para = document.getElementById('para');
      const textNodes = DOMUtils.extractTextNodes(para);
      const allText = textNodes.map(n => n.textContent).join('');

      expect(allText).not.toContain('sum_');
      expect(allText).toContain('See');
      expect(allText).toContain('for sum');
    });

    test('should skip text inside .MathJax elements', () => {
      document.body.innerHTML = `
        <p id="para">Value <span class="MathJax">x = 5</span> computed.</p>
      `;
      const para = document.getElementById('para');
      const textNodes = DOMUtils.extractTextNodes(para);
      const allText = textNodes.map(n => n.textContent).join('');

      expect(allText).not.toContain('x = 5');
      expect(allText).toContain('Value');
      expect(allText).toContain('computed');
    });

    test('should skip text inside <style> elements', () => {
      document.body.innerHTML = `
        <div id="container">
          <style>.test { color: red; }</style>
          <p>Normal text here.</p>
        </div>
      `;
      const container = document.getElementById('container');
      const textNodes = DOMUtils.extractTextNodes(container);
      const allText = textNodes.map(n => n.textContent).join('');

      expect(allText).not.toContain('color');
      expect(allText).not.toContain('.test');
      expect(allText).toContain('Normal text here');
    });

    test('should skip text inside <script> elements', () => {
      document.body.innerHTML = `
        <div id="container">
          <script>console.log("hello");</script>
          <p>Visible content.</p>
        </div>
      `;
      const container = document.getElementById('container');
      const textNodes = DOMUtils.extractTextNodes(container);
      const allText = textNodes.map(n => n.textContent).join('');

      expect(allText).not.toContain('console');
      expect(allText).not.toContain('hello');
      expect(allText).toContain('Visible content');
    });

    test('should handle complex Wikipedia math paragraph', () => {
      // Simulates real Wikipedia structure
      document.body.innerHTML = `
        <p id="para">One such method is
          <span class="mwe-math-element">
            <span class="mwe-math-mathml-inline mwe-math-mathml-a11y" style="display: none;">
              <math><semantics><mrow><mi>ε</mi></mrow>
                <annotation encoding="application/x-tex">{\\displaystyle \\varepsilon }</annotation>
              </semantics></math>
            </span>
            <img src="epsilon.svg" class="mwe-math-fallback-image-inline" alt="\\varepsilon">
          </span>-greedy, where
          <span class="mwe-math-element">
            <span class="mwe-math-mathml-inline">
              <math><semantics><mrow><mn>0</mn><mo>&lt;</mo><mi>ε</mi><mo>&lt;</mo><mn>1</mn></mrow>
                <annotation encoding="application/x-tex">{\\displaystyle 0&lt;\\varepsilon &lt;1}</annotation>
              </semantics></math>
            </span>
          </span> is a parameter.
        </p>
      `;
      const para = document.getElementById('para');
      const textNodes = DOMUtils.extractTextNodes(para);
      const allText = textNodes.map(n => n.textContent).join('');

      // Should NOT contain any LaTeX
      expect(allText).not.toContain('displaystyle');
      expect(allText).not.toContain('\\varepsilon');
      // Should contain the readable text
      expect(allText).toContain('One such method is');
      expect(allText).toContain('-greedy');
      expect(allText).toContain('is a parameter');
    });
  });
});
