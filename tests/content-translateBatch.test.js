const { DOMUtils } = require('../src/utils/dom-utils.js');

global.DOMUtils = DOMUtils;

const { translateBatch } = require('../src/content.js');

describe('content translateBatch (stream parser)', () => {
  test('routes streamed SEG markers to the matching nodes by explicit index', async () => {
    document.body.innerHTML = `
      <p id="a">Paragraph one is long enough.</p>
      <p id="b">Paragraph two is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        expect(text).toContain('⟦⟦SEG:0⟧⟧');
        expect(text).toContain('⟦⟦SEG:1⟧⟧');
        onChunk('⟦⟦SEG:0⟧⟧');
        onChunk('你好');
        onChunk('⟦⟦SEG:1⟧⟧');
        onChunk('世界');
        onDone();
      },
    };

    await translateBatch(
      [
        { element: a, text: a.textContent },
        { element: b, text: b.textContent },
      ],
      llmClient
    );

    const aNode = a.querySelector(':scope > .immersive-translate-target');
    const bNode = b.querySelector(':scope > .immersive-translate-target');

    expect(aNode).not.toBeNull();
    expect(bNode).not.toBeNull();
    expect(aNode.textContent).toBe('你好');
    expect(bNode.textContent).toBe('世界');
  });

  test('handles a SEG marker split across chunks without leaking marker text', async () => {
    document.body.innerHTML = `
      <p id="a">Paragraph one is long enough.</p>
      <p id="b">Paragraph two is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        onChunk('⟦⟦SEG:0⟧⟧First⟦');
        onChunk('⟦SEG:1⟧⟧Second');
        onDone();
      },
    };

    await translateBatch(
      [
        { element: a, text: a.textContent },
        { element: b, text: b.textContent },
      ],
      llmClient
    );

    const aNode = a.querySelector(':scope > .immersive-translate-target');
    const bNode = b.querySelector(':scope > .immersive-translate-target');

    expect(aNode.textContent).toBe('First');
    expect(bNode.textContent).toBe('Second');
  });

  test('falls back without shifting nodes when one SEG marker is missing and content is merged', async () => {
    document.body.innerHTML = `
      <p id="a">Paragraph one is long enough.</p>
      <p id="b">Paragraph two is also long enough.</p>
      <p id="c">Paragraph three is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const c = document.getElementById('c');
    const requests = [];

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        requests.push(text);
        if (requests.length === 1) {
          onChunk('⟦⟦SEG:0⟧⟧甲一甲二');
          onChunk('⟦⟦SEG:2⟧⟧甲三');
          onDone();
          return;
        }
        if (text.includes('Paragraph one')) {
          onChunk('⟦⟦SEG:0⟧⟧甲一');
        } else if (text.includes('Paragraph two')) {
          onChunk('⟦⟦SEG:1⟧⟧甲二');
        }
        onDone();
      },
    };

    await translateBatch(
      [
        { element: a, text: a.textContent },
        { element: b, text: b.textContent },
        { element: c, text: c.textContent },
      ],
      llmClient
    );

    const aNode = a.querySelector(':scope > .immersive-translate-target');
    const bNode = b.querySelector(':scope > .immersive-translate-target');
    const cNode = c.querySelector(':scope > .immersive-translate-target');

    expect(requests).toHaveLength(3);
    expect(requests[1]).toContain('Paragraph one');
    expect(requests[1]).not.toContain('Paragraph two');
    expect(requests[2]).toContain('Paragraph two');
    expect(requests[2]).not.toContain('Paragraph three');
    expect(aNode.textContent).toBe('甲一');
    expect(bNode.textContent).toBe('甲二');
    expect(cNode.textContent).toBe('甲三');
  });

  test('does not lose the tail segment when the model emits an extra SEG marker', async () => {
    document.body.innerHTML = `
      <p id="a">Paragraph one is long enough.</p>
      <p id="b">Paragraph two is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const requests = [];

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        requests.push(text);
        if (requests.length === 1) {
          onChunk('⟦⟦SEG:0⟧⟧第一段');
          onChunk('⟦⟦SEG:1⟧⟧bad partial');
          onChunk('⟦⟦SEG:1⟧⟧第二段');
          onDone();
          return;
        }
        expect(text).toContain('Paragraph two');
        onChunk('⟦⟦SEG:1⟧⟧第二段');
        onDone();
      },
    };

    await translateBatch(
      [
        { element: a, text: a.textContent },
        { element: b, text: b.textContent },
      ],
      llmClient
    );

    const aNode = a.querySelector(':scope > .immersive-translate-target');
    const bNode = b.querySelector(':scope > .immersive-translate-target');

    expect(requests).toHaveLength(2);
    expect(aNode.textContent).toBe('第一段');
    expect(bNode.textContent).toBe('第二段');
  });

  test('escapes source SEG-like sentinel text so mapping is not corrupted', async () => {
    document.body.innerHTML = `
      <p id="a">Source contains ⟦⟦SEG:9⟧⟧ and %% signs.</p>
      <p id="b">Paragraph two is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        const markers = text.match(/⟦⟦SEG:\d+⟧⟧/g) || [];
        expect(markers).toEqual(['⟦⟦SEG:0⟧⟧', '⟦⟦SEG:1⟧⟧']);
        expect(text).toContain('[[SEG:9]]');
        expect(text).toContain('%% signs');
        onChunk('⟦⟦SEG:0⟧⟧源文本安全');
        onChunk('⟦⟦SEG:1⟧⟧第二段');
        onDone();
      },
    };

    await translateBatch(
      [
        { element: a, text: a.textContent },
        { element: b, text: b.textContent },
      ],
      llmClient
    );

    const aNode = a.querySelector(':scope > .immersive-translate-target');
    const bNode = b.querySelector(':scope > .immersive-translate-target');

    expect(aNode.textContent).toBe('源文本安全');
    expect(bNode.textContent).toBe('第二段');
  });
});

describe('content translateBatch (richtext v2 token protocol)', () => {
  const { RichTextV2 } = require('../src/utils/richtext-v2.js');
  global.RichTextV2 = RichTextV2;

  test('renders translated output with preserved <a href> and footnote <sup.reference>', async () => {
    document.body.innerHTML = `
      <p id="a">
        Sutton attended <a href="/wiki/Brenham">Brenham</a><sup class="reference"><a href="#cite_note-1">[1]</a></sup>.
      </p>
    `;
    const a = document.getElementById('a');

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        // Ensure the request uses RichText V2 marker + token syntax
        expect(text).toContain('⟦⟦SEG:0⟧⟧');
        expect(text).toContain('[[ITC_RICH_V2]]');
        expect(text).toContain('[[ITC:a0]]');
        expect(text).toContain('[[/ITC]]');
        expect(text).toContain('[[ITC:ref0]]');

        onChunk('⟦⟦SEG:0⟧⟧[[ITC_RICH_V2]]\\n他就读于[[ITC:a0]]布伦汉姆[[/ITC]]高中[[ITC:ref0]]。');
        onDone();
      },
    };

    await translateBatch([{ element: a, text: a.textContent, richText: 'v2' }], llmClient);

    const node = a.querySelector(':scope > .immersive-translate-target');
    expect(node).not.toBeNull();
    const link = node.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/wiki/Brenham');
    const sup = node.querySelector('sup.reference');
    expect(sup).not.toBeNull();
    expect(sup.querySelector('a').getAttribute('href')).toBe('#cite_note-1');
  });
});
