// Main Content Script Logic
console.log('Immersive Translate Clone loaded.');

// Global State
let isScanning = false;
let isTranslating = false;
let translationQueue = [];
let activeWorkers = 0;

// Configuration constants
// MAX_CONCURRENT_WORKERS = 1: Single worker ensures DOM stability and avoids API rate limits
// when using batched requests. Increase only if API supports high concurrency.
const MAX_CONCURRENT_WORKERS = 1;
// DEFAULT_BATCH_SIZE = 10: Default paragraphs per batch (Issue 31a).
// User can configure via Settings; actual value read from storage in runTranslationProcess().
const DEFAULT_BATCH_SIZE = 10;
// Issue 41: Batch size limits for security and performance
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 50;
const SEGMENT_MARKER_PREFIX = '⟦⟦SEG:';
const SEGMENT_MARKER_SUFFIX = '⟧⟧';
const SEGMENT_MARKER_PATTERN = /⟦⟦SEG:(\d+)⟧⟧/g;

function buildSegmentMarker(index) {
    return `${SEGMENT_MARKER_PREFIX}${index}${SEGMENT_MARKER_SUFFIX}`;
}

function sanitizeSegmentText(text) {
    return String(text || '')
        .replace(/⟦⟦SEG:(\d+)⟧⟧/g, '[[SEG:$1]]')
        .replace(/⟦⟦SEG:/g, '[[SEG:')
        .replace(/<\s*\/\s*translate_input\s*>/gi, (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        .replace(/<\s*translate_input\b[^>]*>/gi, (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

function findNextSegmentMarker(text) {
    SEGMENT_MARKER_PATTERN.lastIndex = 0;
    const match = SEGMENT_MARKER_PATTERN.exec(text);
    if (!match) return null;
    return {
        start: match.index,
        end: match.index + match[0].length,
        index: parseInt(match[1], 10),
    };
}

function isPartialSegmentMarker(text) {
    if (!text) return false;
    if (SEGMENT_MARKER_PREFIX.startsWith(text)) return true;
    return /^⟦⟦SEG:\d*$/.test(text) || /^⟦⟦SEG:\d+⟧$/.test(text);
}

function findPartialSegmentMarkerStart(text) {
    const maxMarkerLength = SEGMENT_MARKER_PREFIX.length + 10 + SEGMENT_MARKER_SUFFIX.length;
    const start = Math.max(0, text.length - maxMarkerLength);
    for (let i = start; i < text.length; i++) {
        if (isPartialSegmentMarker(text.substring(i))) return i;
    }
    return -1;
}

/**
 * Issue 41: Validate and sanitize batch size
 * @param {number} size - User-provided batch size
 * @returns {number} Validated batch size within safe range
 */
function validateBatchSize(size) {
    const parsed = parseInt(size, 10);
    if (isNaN(parsed) || parsed < MIN_BATCH_SIZE) return DEFAULT_BATCH_SIZE;
    if (parsed > MAX_BATCH_SIZE) return MAX_BATCH_SIZE;
    return parsed;
}

// Worker function: continuously pulls from queue until empty
// batchSize (Issue 31a): number of paragraphs per batch, read from user settings
async function translationWorker(llmClient, batchSize = DEFAULT_BATCH_SIZE) {
    if (activeWorkers >= MAX_CONCURRENT_WORKERS) return;
    activeWorkers++;
    isTranslating = true;

    console.log('Worker started. Active:', activeWorkers);

    while (translationQueue.length > 0) {
        // Create a batch
        const batch = [];
        while (batch.length < batchSize && translationQueue.length > 0) {
            batch.push(translationQueue.shift());
        }

        if (batch.length === 0) break;

        try {
            await translateBatch(batch, llmClient);
        } catch (err) {
            console.error('Batch translation failed:', err);
            // Mark failed items as error
            batch.forEach(ctx => {
                const node = DOMUtils.injectTranslationNode(ctx.element);
                DOMUtils.showError(node, err.message || 'Error');
            });
        }
    }

    activeWorkers--;
    console.log('Worker stopped. Active:', activeWorkers);

    // Mark translation as complete when all workers finish
    if (activeWorkers === 0) {
        isTranslating = false;
        console.log('All translations completed.');
    }
}

async function translateBatch(batch, llmClient) {
    // RichText V2 marker (token protocol)
    const RICH_V2_MARKER = '[[ITC_RICH_V2]]';

    // 1. Prepare tokenized inputs (before injecting loading nodes)
    const richTokenized = new Array(batch.length).fill(null);
    const modes = batch.map((ctx, idx) => {
        if (ctx && ctx.richText === 'v2') {
            if (typeof globalThis !== 'undefined' && globalThis.RichTextV2 && typeof globalThis.RichTextV2.tokenizeElement === 'function') {
                richTokenized[idx] = globalThis.RichTextV2.tokenizeElement(ctx.element);
                return 'v2';
            }
        }
        return 'plain';
    });

    // 2. Prepare UI nodes
    const nodes = batch.map((ctx) => {
        if (DOMUtils.isSeparatelyTranslated(ctx.element)) return null;
        return DOMUtils.injectTranslationNode(ctx.element);
    });

    // 3. Prepare text with explicit segment identity markers.
    const segmentInputs = batch.map((ctx, idx) => {
        let text;
        if (modes[idx] === 'v2' && richTokenized[idx] && typeof richTokenized[idx].text === 'string') {
            text = richTokenized[idx].text;
        } else {
            text = (ctx.text || '').replace(/\n/g, ' ');
        }
        return `${buildSegmentMarker(idx)}\n${sanitizeSegmentText(text)}`;
    });
    const combinedText = segmentInputs.join('\n');

    // 4. Stream Handler State
    let buffer = '';
    let activeIndex = null;
    let expectedNextIndex = 0;
    let lastClosedIndex = null;
    let invalidMarkerSeen = false;
    let batchFailed = false;
    const segmentTexts = new Array(batch.length).fill('');
    const seenCounts = new Array(batch.length).fill(0);
    const fallbackIndexes = new Set();

    function renderSegment(index, final) {
        const node = nodes[index];
        if (!node) return;

        const raw = final ? segmentTexts[index].trim() : segmentTexts[index].trimStart();
        if (modes[index] === 'v2' && richTokenized[index] && globalThis.RichTextV2) {
            if (!final) return;
            const ok = globalThis.RichTextV2.renderToNode(node, richTokenized[index], raw);
            if (!ok) {
                node.textContent = raw;
            }
            return;
        }

        DOMUtils.removeLoadingState(node);
        node.textContent = raw;
    }

    function appendToActiveSegment(content) {
        if (activeIndex === null || !content) return;
        segmentTexts[activeIndex] += content;
        renderSegment(activeIndex, false);
    }

    function finalizeActiveSegment() {
        if (activeIndex === null) return null;
        const closedIndex = activeIndex;
        renderSegment(closedIndex, true);
        if (segmentTexts[closedIndex].trim().length === 0) {
            fallbackIndexes.add(closedIndex);
        }
        lastClosedIndex = closedIndex;
        activeIndex = null;
        return closedIndex;
    }

    function markSkippedSegments(nextIndex, previousIndex) {
        if (nextIndex <= expectedNextIndex) return;
        const lastSkipped = Math.min(nextIndex, batch.length);
        for (let i = expectedNextIndex; i < lastSkipped; i++) {
            fallbackIndexes.add(i);
        }
        if (nextIndex >= 0 && nextIndex < batch.length) {
            fallbackIndexes.add(nextIndex);
        }
        if (previousIndex !== null && previousIndex !== undefined) {
            fallbackIndexes.add(previousIndex);
        }
    }

    function startSegment(index, previousIndex) {
        if (index < 0 || index >= batch.length) {
            invalidMarkerSeen = true;
            if (previousIndex !== null && previousIndex !== undefined) {
                fallbackIndexes.add(previousIndex);
            }
            return;
        }

        if (index !== expectedNextIndex) {
            if (index > expectedNextIndex) {
                markSkippedSegments(index, previousIndex);
            } else {
                fallbackIndexes.add(index);
                if (previousIndex !== null && previousIndex !== undefined) {
                    fallbackIndexes.add(previousIndex);
                }
            }
        }

        seenCounts[index]++;
        if (seenCounts[index] > 1) {
            fallbackIndexes.add(index);
            activeIndex = null;
            return;
        }

        segmentTexts[index] = '';
        activeIndex = index;
        expectedNextIndex = Math.max(expectedNextIndex, index + 1);
    }

    function processBuffer(final) {
        while (true) {
            const marker = findNextSegmentMarker(buffer);
            if (marker) {
                appendToActiveSegment(buffer.substring(0, marker.start));
                const previousIndex = finalizeActiveSegment();
                startSegment(marker.index, previousIndex);
                buffer = buffer.substring(marker.end);
                continue;
            }

            if (activeIndex === null) {
                const partialStart = findPartialSegmentMarkerStart(buffer);
                buffer = partialStart === -1 ? '' : buffer.substring(partialStart);
                return;
            }

            if (modes[activeIndex] === 'v2') {
                if (final) {
                    appendToActiveSegment(buffer);
                    buffer = '';
                    finalizeActiveSegment();
                }
                return;
            }

            const partialStart = findPartialSegmentMarkerStart(buffer);
            if (final) {
                appendToActiveSegment(buffer);
                buffer = '';
                finalizeActiveSegment();
                return;
            }

            if (partialStart === -1) {
                appendToActiveSegment(buffer);
                buffer = '';
            } else {
                appendToActiveSegment(buffer.substring(0, partialStart));
                buffer = buffer.substring(partialStart);
            }
            return;
        }
    }

    function collectFallbackIndexes() {
        const missing = [];
        let highestSeen = -1;
        for (let i = 0; i < seenCounts.length; i++) {
            if (seenCounts[i] > 0) highestSeen = i;
            if (seenCounts[i] !== 1) {
                missing.push(i);
                fallbackIndexes.add(i);
            }
        }
        if (invalidMarkerSeen) {
            for (let i = 0; i < batch.length; i++) {
                fallbackIndexes.add(i);
            }
        }
        if (missing.some(index => index > highestSeen) && lastClosedIndex !== null) {
            fallbackIndexes.add(lastClosedIndex);
        }
        return Array.from(fallbackIndexes)
            .filter(index => index >= 0 && index < batch.length && nodes[index])
            .sort((a, b) => a - b);
    }

    function stripFallbackSegmentMarker(output, expectedIndex) {
        const text = String(output || '');
        const expectedMarker = buildSegmentMarker(expectedIndex);
        const expectedStart = text.indexOf(expectedMarker);
        if (expectedStart !== -1) {
            const rest = text.substring(expectedStart + expectedMarker.length);
            const nextMarker = findNextSegmentMarker(rest);
            return (nextMarker ? rest.substring(0, nextMarker.start) : rest).trim();
        }
        SEGMENT_MARKER_PATTERN.lastIndex = 0;
        return text.replace(SEGMENT_MARKER_PATTERN, '').trim();
    }

    function translateSingleSegment(index) {
        return new Promise((resolve) => {
            let output = '';
            let failed = false;
            llmClient.translateStream(
                segmentInputs[index],
                (chunk) => {
                    output += chunk;
                },
                (error) => {
                    failed = true;
                    if (nodes[index]) DOMUtils.showError(nodes[index], error);
                    resolve();
                },
                () => {
                    if (failed) return;
                    segmentTexts[index] = stripFallbackSegmentMarker(output, index);
                    renderSegment(index, true);
                    resolve();
                }
            );
        });
    }

    async function runFallbackTranslations() {
        const indexes = collectFallbackIndexes();
        for (const index of indexes) {
            await translateSingleSegment(index);
        }
    }

    return new Promise((resolve) => {
        llmClient.translateStream(
            combinedText,
            (chunk) => {
                buffer += chunk;
                processBuffer(false);
            },
            (error) => {
                batchFailed = true;
                batch.forEach((ctx, idx) => {
                    if (nodes[idx]) {
                        nodes[idx].textContent += ` [Error: ${error}]`;
                        nodes[idx].classList.add('immersive-translate-error');
                        DOMUtils.removeLoadingState(nodes[idx]);
                    }
                });
                resolve();
            },
            async () => {
                if (batchFailed) return;
                processBuffer(true);
                await runFallbackTranslations();
                nodes.forEach(node => {
                    if (node) DOMUtils.removeLoadingState(node);
                });
                resolve();
            }
        );
    });
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_translation') {
        runTranslationProcess();
    }
});

// Auto-start for testing
if (new URLSearchParams(window.location.search).get('autostart') === 'true') {
    setTimeout(runTranslationProcess, 1000);
}

async function runTranslationProcess() {
    // Prevent duplicate scans or interrupting ongoing translation
    if (isScanning) {
        console.log('Already scanning, skipping...');
        return;
    }
    if (isTranslating) {
        console.log('Translation in progress, please wait...');
        return;
    }
    isScanning = true;
    console.log('Scanning for translatable elements...');

    try {
        const config = await chrome.storage.sync.get({
            apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            apiKey: '',
            modelName: 'deepseek-v3-2-251201',
            customPrompt: '',
            targetLanguage: 'zh-CN',
            userTranslationPrompt: '',
            temperature: 0.9,
            modelTemperatures: {},
            excludedDomains: [],
            excludedSelectors: [],
            batchSize: DEFAULT_BATCH_SIZE // Issue 31a
        });

        const llmClient = new LLMClient(config);

        // Domain exclusion (Issue 14)
        if (isExcludedDomain(window.location.hostname, config.excludedDomains)) {
            console.log('Translation skipped: excluded domain.');
            return;
        }

        const newNodes = DOMUtils.getTranslatableElements({
            excludedSelectors: config.excludedSelectors,
            targetLanguage: config.targetLanguage,
            // reserved for Issue 19 future options:
            // translateNavigation: config.translateNavigation,
            // translateShortTexts: config.translateShortTexts,
        });
        console.log(`Found ${newNodes.length} new elements.`);

        translationQueue.push(...newNodes);

        // Issue 31a + 41: Use user-configured batch size with validation
        const batchSize = validateBatchSize(config.batchSize);

        while (activeWorkers < MAX_CONCURRENT_WORKERS && translationQueue.length > 0) {
            translationWorker(llmClient, batchSize);
        }

    } catch (e) {
        console.error('Error starting translation:', e);
    } finally {
        isScanning = false;
    }
}

function isExcludedDomain(hostname, patterns) {
    if (!patterns || !Array.isArray(patterns)) return false;
    return patterns.some((pattern) => {
        if (pattern.startsWith('*.')) {
            return hostname.endsWith(pattern.slice(1));
        }
        return hostname === pattern || hostname.endsWith('.' + pattern);
    });
}

// Node.js test support (no effect in extension runtime)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        translateBatch,
        translationWorker,
        runTranslationProcess,
        isExcludedDomain,
        validateBatchSize,
        MIN_BATCH_SIZE,
        MAX_BATCH_SIZE,
    };
}
