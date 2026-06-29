const { DOMUtils } = require('../src/utils/dom-utils.js');

global.DOMUtils = DOMUtils;

const { runTranslationProcess, translateBatch } = require('../src/content.js');

describe('content scan configuration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.LLMClient;
  });

  test('forwards scan options from storage to DOMUtils', async () => {
    chrome.storage.sync.get.mockImplementationOnce((defaults) => Promise.resolve({
      ...defaults,
      apiUrl: 'https://api.example.com',
      apiKey: 'test-key',
      modelName: 'test-model',
      targetLanguage: 'zh-CN',
      excludedSelectors: ['.no-translate'],
      translateAside: true,
      translateHeaderFooter: true,
      languageGateEnabled: false,
      languageGateCJKThreshold: 0.75,
    }));
    global.LLMClient = jest.fn(function LLMClient(config) {
      this.config = config;
    });
    const scanSpy = jest.spyOn(DOMUtils, 'getTranslatableElements').mockReturnValue([]);

    await runTranslationProcess();

    expect(scanSpy).toHaveBeenCalledWith(expect.objectContaining({
      excludedSelectors: ['.no-translate'],
      targetLanguage: 'zh-CN',
      translateAside: true,
      translateHeaderFooter: true,
      languageGateEnabled: false,
      languageGateCJKThreshold: 0.75,
    }));
  });
});

describe('content translateBatch (stream parser)', () => {
  test('splits streamed output by %% and routes paragraphs to the correct nodes', async () => {
    document.body.innerHTML = `
      <p id="a">Paragraph one is long enough.</p>
      <p id="b">Paragraph two is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        // Ensure we are batching with the immersive protocol separator
        expect(text).toContain('%%');
        onChunk('你好');
        onChunk('%%');
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

  test('does not flash a stray % when %% is split across chunks', async () => {
    document.body.innerHTML = `
      <p id="a">Paragraph one is long enough.</p>
      <p id="b">Paragraph two is also long enough.</p>
    `;

    const a = document.getElementById('a');
    const b = document.getElementById('b');

    const llmClient = {
      translateStream: (text, onChunk, onError, onDone) => {
        onChunk('First%');
        onChunk('%Second');
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
        expect(text).toContain('[[ITC_RICH_V2]]');
        expect(text).toContain('[[ITC:a0]]');
        expect(text).toContain('[[/ITC]]');
        expect(text).toContain('[[ITC:ref0]]');

        onChunk('[[ITC_RICH_V2]]\\n他就读于[[ITC:a0]]布伦汉姆[[/ITC]]高中[[ITC:ref0]]。');
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

