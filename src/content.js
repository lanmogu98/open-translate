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

    // 2. Prepare Text with %% separator
    // If batch size is 1, we don't need separator, but strictly following rule 5 in prompt is safer.
    // However, prompt says "Multi-paragraph input -> Use %%".
    const separator = '\n%%\n';
    const combinedText = batch
        .map((ctx, idx) => {
            if (modes[idx] === 'v2' && richTokenized[idx] && typeof richTokenized[idx].text === 'string') {
                // tokenized.text already contains marker + newline + tokenized content
                return richTokenized[idx].text;
            }
            return (ctx.text || '').replace(/\n/g, ' ');
        })
        .join(separator);

    // 3. Stream Handler State
    let buffer = '';
    let currentNodeIndex = 0;

    return new Promise((resolve) => {
        llmClient.translateStream(
            combinedText,
            (chunk) => {
                buffer += chunk;

                // We look for the separator pattern "%%"
                // It might be surrounded by newlines, but "%%" is the strong signal.

                while (true) {
                    const tagIndex = buffer.indexOf('%%');

                    if (tagIndex !== -1) {
                        // Found a separator

                        // Content before the separator belongs to the CURRENT node
                        const content = buffer.substring(0, tagIndex);

                        const node = nodes[currentNodeIndex];
                        if (node) {
                            const mode = modes[currentNodeIndex];
                            if (mode === 'v2' && richTokenized[currentNodeIndex] && globalThis.RichTextV2) {
                                const out = content.trim();
                                const ok = globalThis.RichTextV2.renderToNode(node, richTokenized[currentNodeIndex], out);
                                if (!ok) {
                                    // Issue 39: textContent automatically clears children, no need for innerHTML
                                    node.textContent = out;
                                }
                            } else {
                                // Trim trailing newlines usually associated with the separator
                                DOMUtils.appendTranslation(node, content.trimEnd());
                            }
                        }

                        // Advance to next node
                        currentNodeIndex++;

                        // Remove processed part + separator length (2 for %%) from buffer
                        // But wait, it might be \n%%\n.
                        // We should be resilient.
                        // Let's remove the %% and any immediate following newlines or spaces to start fresh for next node.

                        let nextStart = tagIndex + 2;
                        // Skip logic or simple slice? 
                        // Simple slice is safest, subsequent trim usually handles whitespace.

                        buffer = buffer.substring(nextStart);

                    } else {
                        // No separator found yet.
                        // For rich-text V2 paragraphs we must buffer until paragraph boundary,
                        // otherwise we'd render incomplete token sequences.
                        if (modes[currentNodeIndex] === 'v2') {
                            break; // wait for more data
                        }

                        // Plain path: filter out partial "%%" before flushing to UI
                        // to avoid users seeing "%" momentarily.
                        const partialMatch = buffer.lastIndexOf('%');
                        if (partialMatch !== -1 && buffer.length - partialMatch < 2) {
                            // Possible start of %%, keep it in buffer
                            const safeContent = buffer.substring(0, partialMatch);
                            if (nodes[currentNodeIndex]) {
                                DOMUtils.appendTranslation(nodes[currentNodeIndex], safeContent);
                            }
                            buffer = buffer.substring(partialMatch);
                        } else {
                            // Safe to flush all
                            if (nodes[currentNodeIndex]) {
                                DOMUtils.appendTranslation(nodes[currentNodeIndex], buffer);
                            }
                            buffer = '';
                        }
                        break; // Wait for more data
                    }
                }
            },
            (error) => {
                batch.forEach((ctx, idx) => {
                    if (nodes[idx]) {
                        nodes[idx].textContent += ` [Error: ${error}]`;
                        nodes[idx].classList.add('immersive-translate-error');
                        DOMUtils.removeLoadingState(nodes[idx]);
                    }
                });
                resolve();
            },
            () => {
                // Final flush of whatever is left in buffer
                if (buffer.length > 0 && nodes[currentNodeIndex]) {
                    const node = nodes[currentNodeIndex];
                    const mode = modes[currentNodeIndex];
                    if (mode === 'v2' && richTokenized[currentNodeIndex] && globalThis.RichTextV2) {
                        const out = buffer.trim();
                        const ok = globalThis.RichTextV2.renderToNode(node, richTokenized[currentNodeIndex], out);
                        if (!ok) {
                            // Issue 39: textContent automatically clears children, no need for innerHTML
                            node.textContent = out;
                        }
                    } else {
                        DOMUtils.appendTranslation(node, buffer.trim());
                    }
                }

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
            translateAside: false,
            translateHeaderFooter: false,
            languageGateEnabled: true,
            languageGateCJKThreshold: 0.6,
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
            translateAside: config.translateAside,
            translateHeaderFooter: config.translateHeaderFooter,
            languageGateEnabled: config.languageGateEnabled,
            languageGateCJKThreshold: config.languageGateCJKThreshold,
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
