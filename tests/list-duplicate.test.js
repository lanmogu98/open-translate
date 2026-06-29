/**
 * Issue 29: Duplicate Translation in List Items
 *
 * Problem: List items (<li>) are translated twice:
 * 1. Correctly inside the list item
 * 2. Again as merged text at the bottom of the page
 *
 * Root cause: DOM scanning logic selects both <li> elements AND their parent
 * containers (like <div>), causing duplicate translation.
 *
 * This test verifies that:
 * 1. Only leaf-level translatable elements are selected
 * 2. Parent containers with translatable children are NOT selected
 * 3. No duplicate elements are returned
 */

const { DOMUtils } = require('../src/utils/dom-utils.js');

/**
 * Helper to make elements "visible" in jsdom
 */
function makeVisible(element) {
  Object.defineProperty(element, 'offsetParent', {
    value: document.body,
    writable: true,
    configurable: true
  });
  Object.defineProperty(element, 'innerText', {
    get() { return this.textContent; },
    configurable: true
  });
}

function makeAllVisible(selector) {
  document.querySelectorAll(selector).forEach(el => makeVisible(el));
}

describe('Issue 29: Duplicate Translation in List Items', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('list item scanning', () => {
    test('should return only <li> elements, not parent <ul>', () => {
      document.body.innerHTML = `
        <ul id="list">
          <li id="item1">First list item with enough text to translate</li>
          <li id="item2">Second list item with enough text to translate</li>
          <li id="item3">Third list item with enough text to translate</li>
        </ul>
      `;
      makeAllVisible('ul, li');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      // Should include all <li> items
      expect(elementIds).toContain('item1');
      expect(elementIds).toContain('item2');
      expect(elementIds).toContain('item3');

      // Should NOT include the parent <ul> (not in selector anyway)
      expect(elementIds).not.toContain('list');
    });

    test('should NOT select parent <div> when it contains <li> elements that will be translated', () => {
      document.body.innerHTML = `
        <div id="container">
          <ul>
            <li id="item1">List item text that is long enough to translate</li>
            <li id="item2">Another list item with sufficient text content</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      // Should include <li> items
      expect(elementIds).toContain('item1');
      expect(elementIds).toContain('item2');

      // Should NOT include the parent <div>
      // This is the key assertion for Issue 29
      expect(elementIds).not.toContain('container');
    });

    test('should NOT have duplicate text content in returned elements', () => {
      document.body.innerHTML = `
        <div id="wrapper">
          <h2 id="title">Learning Outcomes</h2>
          <ul>
            <li id="li1">Understand reinforcement learning fundamentals</li>
            <li id="li2">Apply value function approximation methods</li>
            <li id="li3">Implement policy gradient algorithms</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, h2, ul, li');

      const elements = DOMUtils.getTranslatableElements();

      // Collect all text content from selected elements
      const allTexts = elements.map(e => e.text);

      // Count occurrences of each text
      const textCounts = {};
      allTexts.forEach(text => {
        // Normalize text for comparison
        const normalized = text.trim();
        textCounts[normalized] = (textCounts[normalized] || 0) + 1;
      });

      // Each text should appear only once
      Object.entries(textCounts).forEach(([text, count]) => {
        expect(count).toBe(1);
      });
    });

    test('should NOT select <div> that contains translatable <p> children', () => {
      document.body.innerHTML = `
        <div id="section">
          <p id="para1">This is the first paragraph with enough content.</p>
          <p id="para2">This is the second paragraph with enough content.</p>
        </div>
      `;
      makeAllVisible('div, p');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      // Should include paragraphs
      expect(elementIds).toContain('para1');
      expect(elementIds).toContain('para2');

      // Should NOT include the parent div
      expect(elementIds).not.toContain('section');
    });
  });

  describe('nested structure handling', () => {
    test('should handle deeply nested lists correctly', () => {
      document.body.innerHTML = `
        <div id="outer">
          <div id="inner">
            <ul>
              <li id="nested-item">Deeply nested list item text content here</li>
            </ul>
          </div>
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      // Should only include the <li>
      expect(elementIds).toContain('nested-item');
      expect(elementIds).not.toContain('outer');
      expect(elementIds).not.toContain('inner');
    });

    test('should handle mixed content (text + list) in div', () => {
      document.body.innerHTML = `
        <div id="mixed">
          Some introductory text here.
          <ul>
            <li id="item">List item with enough text to translate</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      // The <li> should be included
      expect(elementIds).toContain('item');

      // The div may or may not be included depending on implementation,
      // but the key is: if both are included, the li content should not
      // appear twice in the final translation output
      // For now, we test that if div is included, its text doesn't
      // completely overlap with the li text
    });

    test('CS234 page structure simulation', () => {
      // Simulate the Stanford CS234 page structure
      document.body.innerHTML = `
        <div id="content-section">
          <h2 id="outcomes-title">Learning Outcomes</h2>
          <ul id="outcomes-list">
            <li id="outcome1">Define the key features of reinforcement learning</li>
            <li id="outcome2">Given an application problem, formulate it as an RL problem</li>
            <li id="outcome3">Understand basic exploration methods and the exploration exploitation tradeoff</li>
            <li id="outcome4">Understand value function approximation and policy gradient methods</li>
            <li id="outcome5">Know how RL methods can be used to solve complex decision problems</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, h2, ul, li');

      const elements = DOMUtils.getTranslatableElements();

      // Count how many times each outcome text appears
      const outcomeTexts = [
        'Define the key features of reinforcement learning',
        'Given an application problem, formulate it as an RL problem',
        'Understand basic exploration methods and the exploration exploitation tradeoff',
        'Understand value function approximation and policy gradient methods',
        'Know how RL methods can be used to solve complex decision problems'
      ];

      outcomeTexts.forEach(outcomeText => {
        const count = elements.filter(e => e.text.includes(outcomeText)).length;
        // Each outcome should appear exactly once
        expect(count).toBe(1);
      });

      // The parent div should NOT be selected if it only contains
      // elements that will be separately translated
      const contentSection = elements.find(e => e.element.id === 'content-section');
      expect(contentSection).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    test('div with direct text AND translatable children - potential duplicate issue', () => {
      // This is the KEY scenario for Issue 29
      // When a div has BOTH direct text AND translatable child elements,
      // the child text might get translated twice
      document.body.innerHTML = `
        <div id="problem-div">
          Introduction:
          <ul>
            <li id="item1">First list item with enough text to translate</li>
            <li id="item2">Second list item with enough text to translate</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();

      // Check if the li texts appear in multiple selected elements
      const item1Text = 'First list item with enough text to translate';
      const elementsContainingItem1 = elements.filter(e =>
        e.text.includes(item1Text)
      );

      // Item1 text should appear in EXACTLY ONE element (the li itself)
      // If it appears in both the li AND the parent div, that's the bug
      expect(elementsContainingItem1.length).toBe(1);
      expect(elementsContainingItem1[0].element.id).toBe('item1');
    });

    test('div with direct text AND table cell should not duplicate cell text', () => {
      document.body.innerHTML = `
        <div id="outer">
          Intro before table.
          <table>
            <tbody>
              <tr>
                <td id="cell">Cell text with enough content to translate.</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      makeAllVisible('div, table, tbody, tr, td');

      const elements = DOMUtils.getTranslatableElements();
      const cellText = 'Cell text with enough content to translate.';
      const elementsContainingCell = elements.filter(e => e.text.includes(cellText));

      expect(elementsContainingCell.length).toBe(1);
      expect(elementsContainingCell[0].element.id).toBe('cell');
      expect(elements.find(e => e.element.id === 'outer')).toBeUndefined();
    });

    test('div with direct text AND nested div should not duplicate nested div text', () => {
      document.body.innerHTML = `
        <div id="outer">
          Lead before nested div.
          <div id="inner">Nested div text with enough content to translate.</div>
        </div>
      `;
      makeAllVisible('div');

      const elements = DOMUtils.getTranslatableElements();
      const innerText = 'Nested div text with enough content to translate.';
      const elementsContainingInner = elements.filter(e => e.text.includes(innerText));

      expect(elementsContainingInner.length).toBe(1);
      expect(elementsContainingInner[0].element.id).toBe('inner');
      expect(elements.find(e => e.element.id === 'outer')).toBeUndefined();
    });

    test('div with ONLY direct text (no child elements) SHOULD be translated', () => {
      document.body.innerHTML = `
        <div id="text-only">This div has only direct text content, no child elements at all.</div>
      `;
      makeAllVisible('div');

      const elements = DOMUtils.getTranslatableElements();
      const div = elements.find(e => e.element.id === 'text-only');

      // This div has direct text and no translatable children, so it should be included
      expect(div).toBeDefined();
    });

    test('empty parent div with only whitespace should NOT be translated', () => {
      document.body.innerHTML = `
        <div id="empty-parent">
          <p id="child">Child paragraph with text content here.</p>
        </div>
      `;
      makeAllVisible('div, p');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      expect(elementIds).toContain('child');
      expect(elementIds).not.toContain('empty-parent');
    });

    test('mixed content div: direct text SHOULD be translated via wrapper spans (Issue 29 fix)', () => {
      // Updated test for Issue 29 fix using text wrapping approach
      // When a div has direct text AND translatable children,
      // the direct text is wrapped in spans and translated independently
      document.body.innerHTML = `
        <div id="mixed-div">
          Introduction text that should be translated
          <ul>
            <li id="item1">First list item with enough text</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id || e.element.className);

      // The <li> should be translated
      expect(elementIds).toContain('item1');

      // The parent div should NOT be in elements (it's skipped)
      expect(elementIds).not.toContain('mixed-div');

      // Instead, a wrapper span should contain the introduction text
      const wrappers = elements.filter(e =>
        e.element.className === 'immersive-translate-text-wrapper'
      );
      expect(wrappers.length).toBeGreaterThan(0);
      expect(wrappers.some(w => w.text.includes('Introduction text'))).toBe(true);
    });

    test('pure container div (no direct text) should NOT be translated', () => {
      // This ensures we still prevent duplicates for pure containers
      document.body.innerHTML = `
        <div id="pure-container">
          <p id="para1">First paragraph with enough text to translate</p>
          <p id="para2">Second paragraph with enough text to translate</p>
        </div>
      `;
      makeAllVisible('div, p');

      const elements = DOMUtils.getTranslatableElements();
      const elementIds = elements.map(e => e.element.id);

      // Paragraphs should be translated
      expect(elementIds).toContain('para1');
      expect(elementIds).toContain('para2');

      // Pure container (no direct text) should NOT be translated
      expect(elementIds).not.toContain('pure-container');
    });

    test('wrapper spans should preserve text content (text wrapping replaces getDirectTextContent)', () => {
      // With text wrapping, each text node becomes a separate wrapper span
      // The spacing is naturally preserved since each text node is independent
      document.body.innerHTML = `
        <div id="spaced-div">
          Hello World text here
          <span>ignored</span>
          Another paragraph here
          <ul>
            <li id="item">List item with enough text here</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, span, ul, li');

      const elements = DOMUtils.getTranslatableElements();

      // Should have wrapper spans for the text nodes
      const wrappers = elements.filter(e =>
        e.element.className === 'immersive-translate-text-wrapper'
      );

      // Each substantial text block should have its own wrapper
      expect(wrappers.length).toBeGreaterThanOrEqual(1);
      // Text content should be preserved in wrappers
      expect(wrappers.some(w => w.text.includes('Hello World'))).toBe(true);
    });

    test('adjacent text and inline nodes become one wrapper run before block children', () => {
      document.body.innerHTML = `<div id="adjacent-div">First part here<span>ignored</span>Second part here<ul><li id="item">List item text here</li></ul></div>`;
      makeAllVisible('div, span, ul, li');

      const elements = DOMUtils.getTranslatableElements();

      // Should have wrapper spans
      const wrappers = elements.filter(e =>
        e.element.className === 'immersive-translate-text-wrapper'
      );

      // Inline text is part of the parent run; block children remain separate.
      expect(wrappers.length).toBe(1);
      expect(wrappers[0].text).toBe('First part hereignoredSecond part here');
    });
  });

  describe('wrapDirectTextNodes', () => {
    test('should wrap substantial direct text nodes in spans', () => {
      document.body.innerHTML = `
        <div id="mixed">
          First paragraph of text here
          <ul><li id="item">List item</li></ul>
          Second paragraph of text
        </div>
      `;
      const div = document.getElementById('mixed');
      const wrappers = DOMUtils.wrapDirectTextNodes(div);

      // Should create 2 wrapper spans (one for each text block)
      expect(wrappers.length).toBe(2);

      // Each wrapper should have the correct class
      wrappers.forEach(span => {
        expect(span.className).toBe('immersive-translate-text-wrapper');
      });

      // Text content should be preserved
      expect(wrappers[0].textContent).toContain('First paragraph');
      expect(wrappers[1].textContent).toContain('Second paragraph');

      // Wrappers should be in the DOM
      expect(div.querySelectorAll('.immersive-translate-text-wrapper').length).toBe(2);
    });

    test('should NOT wrap short text nodes (below threshold)', () => {
      document.body.innerHTML = `
        <div id="mixed">
          Hi
          <ul><li>List item with enough text</li></ul>
        </div>
      `;
      const div = document.getElementById('mixed');
      const wrappers = DOMUtils.wrapDirectTextNodes(div);

      // "Hi" is too short (< 3 chars), should not be wrapped
      expect(wrappers.length).toBe(0);
    });

    test('should NOT wrap pure number text nodes', () => {
      document.body.innerHTML = `
        <div id="mixed">
          12345
          <ul><li>List item</li></ul>
        </div>
      `;
      const div = document.getElementById('mixed');
      const wrappers = DOMUtils.wrapDirectTextNodes(div);

      expect(wrappers.length).toBe(0);
    });

    test('should preserve DOM structure after wrapping', () => {
      document.body.innerHTML = `
        <div id="mixed">
          Text before
          <p id="para">Paragraph</p>
          Text after
        </div>
      `;
      const div = document.getElementById('mixed');
      DOMUtils.wrapDirectTextNodes(div);

      // <p> should still exist and be in correct position
      const para = document.getElementById('para');
      expect(para).not.toBeNull();
      expect(para.parentElement).toBe(div);
    });
  });

  describe('mixed content container handling (text wrapping)', () => {
    test('mixed container: direct text should be wrapped and returned separately', () => {
      document.body.innerHTML = `
        <div id="coursedesc">
          To realize the dreams and impact of AI requires autonomous systems.
          <ul>
            <li id="li1">Lectures will be live every Monday</li>
            <li id="li2">Office hours will be announced</li>
          </ul>
          Communication info goes here with enough text.
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();
      const ids = elements.map(e => e.element.id || e.element.className);

      // Should include li elements
      expect(ids).toContain('li1');
      expect(ids).toContain('li2');

      // Should NOT include the container div
      expect(ids).not.toContain('coursedesc');

      // Should include wrapped text spans
      const wrapperElements = elements.filter(e =>
        e.element.className === 'immersive-translate-text-wrapper'
      );
      expect(wrapperElements.length).toBe(2);

      // Verify text content of wrappers
      const wrapperTexts = wrapperElements.map(e => e.text);
      expect(wrapperTexts.some(t => t.includes('dreams'))).toBe(true);
      expect(wrapperTexts.some(t => t.includes('Communication'))).toBe(true);
    });

    test('wrapped spans should be positioned correctly in DOM', () => {
      document.body.innerHTML = `
        <div id="mixed">
          First text block here
          <p id="middle">Middle element</p>
          Second text block here
        </div>
      `;
      makeAllVisible('div, p');

      DOMUtils.getTranslatableElements();

      const div = document.getElementById('mixed');
      const children = Array.from(div.children);

      // Order should be: wrapper1, p, wrapper2
      expect(children[0].className).toBe('immersive-translate-text-wrapper');
      expect(children[1].id).toBe('middle');
      expect(children[2].className).toBe('immersive-translate-text-wrapper');
    });

    test('CS234 page structure: no duplicate translations', () => {
      document.body.innerHTML = `
        <div id="coursedesc">
          To realize the dreams and impact of AI requires autonomous systems that learn.
          Reinforcement learning is one powerful paradigm for doing so.
          <br><br>
          <b>Communication:</b> We will use a forum for questions.
          <br><br>
          <ul>
            <li id="lec">Lectures will be live every Monday and Wednesday 3-4:20pm.</li>
            <li id="oh">Office hours: Will be announced in the first week of class</li>
          </ul>
        </div>
      `;
      makeAllVisible('div, ul, li, b, br');

      const elements = DOMUtils.getTranslatableElements();

      // Check for duplicates: "Lectures" text should appear in exactly ONE element
      const lecturesCount = elements.filter(e =>
        e.text.includes('Lectures will be live')
      ).length;
      expect(lecturesCount).toBe(1);

      // The element containing "Lectures" should be the <li>, not a wrapper
      const lecturesElement = elements.find(e => e.text.includes('Lectures will be live'));
      expect(lecturesElement.element.id).toBe('lec');
    });

    test('each text segment should have its own translation position', () => {
      document.body.innerHTML = `
        <div id="mixed">
          Introduction text here
          <ul><li id="item">List item</li></ul>
          Conclusion text here
        </div>
      `;
      makeAllVisible('div, ul, li');

      const elements = DOMUtils.getTranslatableElements();

      // Find the wrapper spans
      const wrappers = elements.filter(e =>
        e.element.className === 'immersive-translate-text-wrapper'
      );

      // Each wrapper should be a direct child of #mixed
      wrappers.forEach(w => {
        expect(w.element.parentElement.id).toBe('mixed');
      });
    });

    test('container with ONLY whitespace text nodes should not create wrappers', () => {
      document.body.innerHTML = `
        <div id="container">
          <p id="p1">Paragraph one</p>
          <p id="p2">Paragraph two</p>
        </div>
      `;
      makeAllVisible('div, p');

      const elements = DOMUtils.getTranslatableElements();

      // Should not have any wrappers (only whitespace between p tags)
      const wrappers = elements.filter(e =>
        e.element.className === 'immersive-translate-text-wrapper'
      );
      expect(wrappers.length).toBe(0);
    });

    test('already wrapped elements should not be re-wrapped', () => {
      document.body.innerHTML = `
        <div id="mixed">
          Some text here enough to wrap
          <ul><li>Item text here</li></ul>
        </div>
      `;
      makeAllVisible('div, ul, li');

      // Call twice
      DOMUtils.getTranslatableElements();
      DOMUtils.getTranslatableElements();

      // Should still only have 1 wrapper
      const wrappers = document.querySelectorAll('.immersive-translate-text-wrapper');
      expect(wrappers.length).toBe(1);
    });
  });
});
