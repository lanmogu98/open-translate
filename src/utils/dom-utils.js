class DOMUtils {
    static isBlockElement(el) {
        const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'DIV', 'SECTION', 'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD', 'BODY-TEXT'];
        return blockTags.includes(el.tagName);
    }

    static hasSignificantText(el) {
        if (!el.textContent) return false;
        const text = el.textContent.trim();
        // Filter out short texts (nav items, buttons usually)
        // Filter out code blocks
        if (el.closest('pre') || el.closest('code')) return false;
        return text.length > 10 && !/^\d+$/.test(text); // More than 10 chars, not just numbers
    }

    static getTranslatableElements() {
        const elements = [];
        const options = arguments.length > 0 ? arguments[0] : undefined;
        const excludedSelectors = (options && Array.isArray(options.excludedSelectors)) ? options.excludedSelectors : [];
        const targetLanguage = options && typeof options.targetLanguage === 'string' ? options.targetLanguage : undefined;
        const translateNavigation = options && options.translateNavigation === true;
        const translateAside = options && options.translateAside === true;
        const translateHeaderFooter = options && options.translateHeaderFooter === true;
        const translateShortTexts = options && options.translateShortTexts === true;
        const languageGateEnabled = !(options && options.languageGateEnabled === false);
        const languageGateCJKThreshold = this.normalizeCJKThresholdOption(options && options.languageGateCJKThreshold);

        const DEFAULT_MIN_LEN = translateShortTexts ? 1 : 8;
        const MAIN_MIN_LEN = 3;
        // Enhanced selector to include lists, blockquotes, captions, and custom elements
        // body-text: Used by sites like The Economist (SvelteKit) for article content
        const candidates = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, div, section, figcaption, dt, dd, body-text');

        for (const element of candidates) {
            // Basic visibility check
            if (!this.isVisible(element)) continue;

            // Prevent translating our own elements
            if (element.classList.contains('immersive-translate-target')) continue;
            if (element.closest('.immersive-translate-target')) continue;

            // Issue 46 Case #1: Skip aria-hidden elements (used for screen reader accessibility)
            // These elements are visually hidden or decorative, not meant to be translated separately
            if (element.getAttribute('aria-hidden') === 'true') continue;
            if (element.closest('[aria-hidden="true"]')) continue;

            // User-defined selector exclusions
            if (excludedSelectors.length > 0 && this.isExcludedBySelector(element, excludedSelectors)) {
                continue;
            }

            // Issue 19: Skip interactive UI chrome (buttons/inputs/menus)
            if (this.isInteractiveElement(element)) continue;

            // Issue 26: Skip style/script elements
            if (this.isStyleOrScript(element)) continue;

            // Issue 27: Skip math formula elements
            if (this.isMathElement(element)) continue;

            // Issue 27: Skip elements that are primarily math content (pure formula paragraphs)
            if (this.isPrimarilyMathContent(element)) continue;

            // Issue 19: Skip navigation-ish areas by default (even if long)
            if (this.shouldSkipNavigationArea(element, {
                translateNavigation,
                translateAside,
                translateHeaderFooter,
            })) continue;

            // Skip navigation bars if possible (simple heuristic: common nav class/id substrings or role)
            // This is hard to get perfect universally without complex logic.
            // For now, we rely on text length. Small text in DIVs is often UI.

            // Ensure it has direct text content (not just nested elements)
            // This helps avoid translating container divs that just hold other divs
            if (['DIV', 'LI', 'TD'].includes(element.tagName) &&
                !this.hasDirectText(element) &&
                !this.hasInlineOnlyTextContent(element)) {
                continue;
            }

            // Issue 29: Handle containers with translatable descendants
            // Use MAIN_MIN_LEN as threshold since descendants could be in main content
            // This ensures we detect all potentially translatable descendants
            const descendantMinLen = Math.min(MAIN_MIN_LEN, DEFAULT_MIN_LEN);
            const hasDescendants = this.hasTranslatableDescendants(element, descendantMinLen);

            // If container has translatable descendants, wrap direct text nodes instead
            // of including the container itself. This prevents translation positioning issues.
            if (hasDescendants) {
                // Wrap direct text nodes in spans for independent translation
                const wrappedSpans = this.wrapDirectTextNodes(element, descendantMinLen);

                // Add each wrapped span as a translatable element
                for (const span of wrappedSpans) {
                    const spanText = this.getElementText(span);
                    // Issue 19: Main content has lower min length
                    const spanMinLen = this.isInMainContent(span) ? Math.min(MAIN_MIN_LEN, DEFAULT_MIN_LEN) : DEFAULT_MIN_LEN;
                    if (spanText.length >= spanMinLen && !/^\d+$/.test(spanText)) {
                        // Make span visible for jsdom tests
                        if (span.offsetParent === null && element.offsetParent !== null) {
                            // Inherit visibility from parent in test environment
                        }
                        elements.push({ element: span, text: spanText });
                    }
                }

                // Skip the container itself - children will be translated separately
                continue;
            }

            // Issue 46 Case #2: Handle <br><br> separated paragraphs
            // Only applies when element has NO translatable descendants (checked above)
            // This splits a single element (e.g., <p>) into multiple translation units
            if (this.hasBrBrSeparator(element)) {
                const wrappedSpans = this.wrapBrBrParagraphs(element, descendantMinLen);

                for (const span of wrappedSpans) {
                    const spanText = this.getElementText(span);
                    const spanMinLen = this.isInMainContent(span) ? Math.min(MAIN_MIN_LEN, descendantMinLen) : descendantMinLen;
                    if (spanText.length >= spanMinLen && !/^\d+$/.test(spanText)) {
                        // Inherit visibility from parent in test environment
                        if (span.offsetParent === null && element.offsetParent !== null) {
                            // jsdom doesn't compute offsetParent for dynamically created elements
                        }
                        elements.push({ element: span, text: spanText });
                    }
                }
                continue; // Skip the container itself
            }

            // Normal case: no translatable descendants, use full text content
            let rawText = this.getElementText(element);
            if (!rawText) continue;

            // Skip pure numbers
            if (/^\d+$/.test(rawText)) continue;

            // Issue 12: Language gating (only effective when LangDetect is loaded)
            if (
                targetLanguage &&
                typeof globalThis !== 'undefined' &&
                globalThis.LangDetect &&
                typeof globalThis.LangDetect.shouldSkipTranslation === 'function' &&
                languageGateEnabled &&
                globalThis.LangDetect.shouldSkipTranslation(rawText, targetLanguage, {
                    enabled: languageGateEnabled,
                    cjkThreshold: languageGateCJKThreshold,
                })
            ) {
                continue;
            }

            // Issue 19: Main content has lower min length
            const minLen = this.isInMainContent(element) ? Math.min(MAIN_MIN_LEN, DEFAULT_MIN_LEN) : DEFAULT_MIN_LEN;
            if (rawText.length >= minLen) {
                // Issue 16 (RichText V2): mark candidates that contain inline markup / links / footnotes
                const richText = this.shouldUseRichTextV2(element) ? 'v2' : undefined;
                elements.push({ element, text: rawText, richText });
            }
        }
        return elements;
    }

    static normalizeText(text) {
        if (!text || typeof text !== 'string') return '';
        return text.replace(/\s+/g, ' ').trim();
    }

    static getElementText(element) {
        return this.normalizeText(element ? element.textContent || '' : '');
    }

    static normalizeCJKThresholdOption(value) {
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return undefined;
        return parsed;
    }

    static isVisible(element) {
        if (!element) return false;

        if (typeof element.checkVisibility === 'function') {
            try {
                return element.checkVisibility({
                    checkOpacity: false,
                    checkVisibilityCSS: true,
                    contentVisibilityAuto: true,
                });
            } catch (e) {
                try {
                    return element.checkVisibility();
                } catch (fallbackError) {
                    return false;
                }
            }
        }

        if (typeof element.getBoundingClientRect === 'function') {
            const rect = element.getBoundingClientRect();
            if (rect && (rect.width > 0 || rect.height > 0)) {
                return true;
            }
        }

        return element.offsetParent !== null;
    }

    static shouldUseRichTextV2(element) {
        if (!element || !element.querySelector) return false;
        // Links, inline styles, and Wikipedia-style footnote references.
        return (
            element.querySelector('a, strong, em, code, sup.reference, .mw-ref') !== null
        );
    }

    static isInMainContent(element) {
        return !!(element && element.closest && element.closest('main, article, [role="main"]'));
    }

    static isInNavigationArea(element) {
        return !!(element && element.closest && element.closest('nav, header, footer, aside, [role="navigation"]'));
    }

    static shouldSkipNavigationArea(element, options = {}) {
        if (!element || !element.closest || options.translateNavigation) return false;
        if (element.closest('nav, [role="navigation"]')) return true;
        if (!options.translateAside && element.closest('aside')) return true;
        if (!options.translateHeaderFooter && element.closest('header, footer')) return true;
        return false;
    }

    static isInteractiveElement(element) {
        if (!element || !element.closest) return false;
        // If the element itself or any ancestor is an interactive control, skip it
        if (element.closest('button, input, select, textarea')) return true;
        // Role-based buttons
        if (element.getAttribute && element.getAttribute('role') === 'button') return true;
        if (element.closest('[role="button"]')) return true;
        return false;
    }

    /**
     * Issue 26: Check if element is or is inside a style/script tag
     * These elements contain code, not translatable content
     */
    static isStyleOrScript(element) {
        if (!element) return false;
        // Check if the element itself is style/script
        const tagName = element.tagName;
        if (tagName === 'STYLE' || tagName === 'SCRIPT') return true;
        // Check if inside style/script
        if (element.closest && element.closest('style, script')) return true;
        return false;
    }

    /**
     * Issue 27: Check if element is or is inside a math formula container
     * Supports: MathML (<math>), Wikipedia (.mwe-math-element), KaTeX (.katex), MathJax (.MathJax)
     */
    static isMathElement(element) {
        if (!element) return false;
        // Check if the element itself is a math element
        if (element.tagName === 'MATH') return true;
        // Check if inside any math container
        if (element.closest && element.closest('math, .mwe-math-element, .katex, .MathJax, .MathJax_Display')) return true;
        return false;
    }

    /**
     * Issue 27: Check if element is primarily math content (after excluding math elements)
     * Returns true if the remaining text has no meaningful content to translate
     */
    static isPrimarilyMathContent(element) {
        if (!element) return false;

        // Get all text content, but exclude math containers
        const clone = element.cloneNode(true);

        // Remove all math-related elements from clone
        const mathSelectors = 'math, .mwe-math-element, .katex, .MathJax, .MathJax_Display, annotation, annotation-xml';
        clone.querySelectorAll(mathSelectors).forEach(el => el.remove());

        // Get remaining text
        const remainingText = (clone.textContent || '').trim();

        // If no meaningful text remains, it's primarily math
        // Allow only: letters (any language), must have at least 2 consecutive word characters
        // Skip if only math symbols, punctuation, single letters, numbers
        const meaningfulTextPattern = /[a-zA-Z\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{2,}/;

        return !meaningfulTextPattern.test(remainingText);
    }

    /**
     * Issue 40: Validate CSS selector for safety
     * Prevents ReDoS attacks and malicious selectors
     * @param {string} selector - CSS selector to validate
     * @returns {boolean} True if selector is safe to use
     */
    static isValidCSSSelector(selector) {
        if (!selector || typeof selector !== 'string') return false;

        // Length limit to prevent extremely long selectors
        if (selector.length > 200) return false;

        // Block potentially dangerous patterns
        const dangerousPatterns = [
            // Extremely deep nesting that could cause performance issues
            /(\s*>\s*){10,}/,        // More than 10 direct child selectors
            /(\s+){20,}/,            // More than 20 descendant selectors
            // Attribute selectors with regex-like patterns (potential ReDoS)
            /\[.*\*=.*\*=.*\]/,      // Multiple wildcard attributes
            /\[.*\$=.*\$=.*\]/,      // Multiple ends-with attributes
            /\[.*\^=.*\^=.*\]/,      // Multiple starts-with attributes
            // Extremely complex pseudo-selectors
            /:not\(.*:not\(.*:not\(/,  // Nested :not more than twice
            // Universal selector abuse
            /^\s*\*\s*\*\s*\*/,      // Multiple universal selectors at start
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(selector)) return false;
        }

        // Try to parse the selector (catches syntax errors)
        try {
            document.querySelector(selector);
            return true;
        } catch (e) {
            return false;
        }
    }

    static isExcludedBySelector(element, selectors) {
        if (!selectors || !Array.isArray(selectors) || !element) return false;
        return selectors.some((sel) => {
            // Issue 40: Validate selector before use
            // Cache results to avoid repeated document.querySelector() calls in scan loops.
            // This keeps selector validation O(M) per scan rather than O(N*M) per element.
            if (!this._cssSelectorSafetyCache) this._cssSelectorSafetyCache = new Map();
            let isSafe = this._cssSelectorSafetyCache.get(sel);
            if (isSafe === undefined) {
                isSafe = this.isValidCSSSelector(sel);
                this._cssSelectorSafetyCache.set(sel, isSafe);
                // Cap cache size to avoid unbounded growth (user can paste large lists).
                if (this._cssSelectorSafetyCache.size > 2000) {
                    this._cssSelectorSafetyCache.clear();
                }
            }
            if (!isSafe) return false;
            try {
                return element.matches(sel) || element.closest(sel) !== null;
            } catch (e) {
                // Invalid selector should not break scanning
                return false;
            }
        });
    }

    static hasDirectText(element) {
        for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                return true;
            }
        }
        return false;
    }

    static hasInlineOnlyTextContent(element) {
        if (!this.getElementText(element)) return false;
        return !Array.from(element.querySelectorAll('*')).some((descendant) => this.isBlockElement(descendant));
    }

    /**
     * Get only the direct text content of an element (excluding text from child elements)
     * Used for mixed-content containers where we want to translate only the direct text
     * @param {Element} element
     * @returns {string} Concatenated direct text nodes with proper spacing, trimmed
     */
    static getDirectTextContent(element) {
        const texts = [];
        for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent.trim();
                if (t) texts.push(t);
            }
        }
        return texts.join(' ');
    }

    /**
     * Issue 29 fix: Wrap substantial direct text nodes in spans for independent translation
     * This solves the positioning problem where mixed-content containers would have
     * all their direct text merged and appended at the end.
     * @param {Element} element - Container element with mixed content
     * @param {number} [minLen=3] - Minimum text length threshold for wrapping
     * @returns {HTMLSpanElement[]} Array of newly created wrapper spans
     */
    static wrapDirectTextNodes(element, minLen = 3) {
        const wrappers = [];
        const textNodes = [];

        // Collect substantial direct text nodes (must iterate fresh each time)
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                // Only wrap if meets minimum length and is not pure numbers
                if (text.length >= minLen && !/^\d+$/.test(text)) {
                    textNodes.push(node);
                }
            }
        }

        // Wrap each in a span
        for (const textNode of textNodes) {
            // Check if already wrapped (idempotency)
            if (textNode.parentElement &&
                textNode.parentElement.className === 'immersive-translate-text-wrapper') {
                continue;
            }

            const span = document.createElement('span');
            span.className = 'immersive-translate-text-wrapper';
            textNode.parentNode.insertBefore(span, textNode);
            span.appendChild(textNode);
            wrappers.push(span);
        }

        return wrappers;
    }

    /**
     * Issue 46 Case #2: Check if element contains <br><br> as paragraph separator
     * @param {Element} element - The element to check
     * @returns {boolean} True if element contains consecutive <br> elements
     */
    static hasBrBrSeparator(element) {
        if (!element) return false;

        const brElements = element.querySelectorAll('br');
        for (const br of brElements) {
            // Check if next sibling is another br (ignoring whitespace text nodes)
            let sibling = br.nextSibling;
            while (sibling && sibling.nodeType === Node.TEXT_NODE && !sibling.textContent.trim()) {
                sibling = sibling.nextSibling;
            }
            if (sibling && sibling.tagName === 'BR') {
                return true;
            }
        }
        return false;
    }

    /**
     * Issue 46 Case #2: Wrap text segments separated by <br><br> in spans
     * Each logical paragraph (separated by <br><br>) gets wrapped for independent translation
     * @param {Element} element - The element containing <br><br> separated paragraphs
     * @param {number} [minLen=3] - Minimum text length threshold for wrapping
     * @returns {HTMLSpanElement[]} Array of wrapper spans for each logical paragraph
     */
    static wrapBrBrParagraphs(element, minLen = 3) {
        const wrappers = [];
        if (!element) return wrappers;

        // Collect all child nodes and group them by <br><br> separators
        const children = Array.from(element.childNodes);
        const segments = []; // Array of arrays of nodes
        let currentSegment = [];

        for (let i = 0; i < children.length; i++) {
            const node = children[i];

            // Check if this is the start of a <br><br> separator
            if (node.tagName === 'BR') {
                // Look ahead to see if next non-whitespace node is also <br>
                let nextIndex = i + 1;
                while (nextIndex < children.length &&
                       children[nextIndex].nodeType === Node.TEXT_NODE &&
                       !children[nextIndex].textContent.trim()) {
                    nextIndex++;
                }

                if (nextIndex < children.length && children[nextIndex].tagName === 'BR') {
                    // Found <br><br> - save current segment and skip both <br>s
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                        currentSegment = [];
                    }
                    i = nextIndex; // Skip to after the second <br>
                    continue;
                }
            }

            currentSegment.push(node);
        }

        // Don't forget the last segment
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }

        // Now wrap each segment in a span
        for (const segment of segments) {
            // Calculate text content of segment
            const segmentText = segment
                .map(n => n.textContent || '')
                .join('')
                .trim();

            // Only wrap if meets minimum length
            if (segmentText.length >= minLen && !/^\d+$/.test(segmentText)) {
                // Create wrapper span
                const span = document.createElement('span');
                span.className = 'immersive-translate-text-wrapper';

                // Insert span before the first node in segment
                const firstNode = segment[0];
                firstNode.parentNode.insertBefore(span, firstNode);

                // Move all segment nodes into the span
                for (const node of segment) {
                    span.appendChild(node);
                }

                wrappers.push(span);
            }
        }

        return wrappers;
    }

    /**
     * Issue 29: Check if element contains translatable descendant elements
     * Returns true if the element has child elements that would be selected for translation
     * This prevents parent containers from being translated when their children will be
     * @param {Element} element - The element to check
     * @param {number} [minLen=8] - Minimum text length threshold (should match getTranslatableElements)
     */
    static hasTranslatableDescendants(element, minLen = 8) {
        if (!element) return false;

        // Leaf-level containers that are typically translated individually
        // These are the "semantic" text containers that should be translated as units
        // body-text: Custom element used by sites like The Economist
        // NOTE: Use lowercase for custom elements to ensure cross-browser compatibility
        const LEAF_CONTAINERS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'figcaption', 'dt', 'dd', 'body-text'];

        // Check if element contains any leaf containers with significant text
        for (const tag of LEAF_CONTAINERS) {
            const descendants = element.querySelectorAll(tag);
            for (const desc of descendants) {
                // Check if descendant has meaningful text content
                const text = this.getElementText(desc);
                if (text.length >= minLen && !/^\d+$/.test(text)) {
                    return true;
                }
            }
        }

        return false;
    }

    static isSeparatelyTranslated(element) {
        // Logic updated to match 'appendChild' strategy
        // We check if the element already contains a direct child with the translation class
        return element.querySelector(':scope > .immersive-translate-target') !== null;
    }

    static injectTranslationNode(element) {
        const node = document.createElement('span'); // Use SPAN to be valid inside P and H tags
        node.className = 'immersive-translate-target';

        // Issue 46 Case #3: Do NOT set inline styles
        // Let CSS classes handle styling for consistency and maintainability
        // The .immersive-translate-target class in content.css provides:
        // - display: block for line separation
        // - margin-top for spacing
        // - font-family: inherit to match parent
        // - opacity for visual distinction

        // Loading State - Issue 39: Use DOM API instead of innerHTML for XSS safety
        const loadingSpan = document.createElement('span');
        loadingSpan.className = 'immersive-translate-loading';
        loadingSpan.textContent = 'Thinking...';
        node.appendChild(loadingSpan);

        // Insert AS LAST CHILD of the original element
        // This prevents breaking Flex/Grid layouts (which happens if we add a sibling)
        element.appendChild(node);

        return node;
    }

    static appendTranslation(node, text) {
        // Determine if this is the first chunk of actual text
        const loading = node.querySelector('.immersive-translate-loading');
        if (loading) {
            // Issue 39: Use DOM API instead of innerHTML for XSS safety
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        }
        node.textContent += text;
    }

    static removeLoadingState(node) {
        if (node.classList.contains('immersive-translate-loading')) {
            node.classList.remove('immersive-translate-loading');
            // Issue 39: Use textContent instead of innerHTML for XSS safety
            node.textContent = '';
        }
        // Also ensure no spinner remains inside
        const loading = node.querySelector('.immersive-translate-loading');
        if (loading) loading.remove();
    }

    static showError(node, message) {
        this.removeLoadingState(node);
        node.textContent = `[Error: ${message}]`;
        node.classList.add('immersive-translate-error');
    }

    /**
     * Extract all text nodes from an element (depth-first traversal)
     * Used for rich text preservation - translates text nodes while keeping markup
     *
     * Issue 26/27: Skips text nodes inside style/script/math elements
     *
     * @param {Element} element - The element to extract text nodes from
     * @returns {Text[]} Array of Text nodes in document order
     */
    static extractTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Issue 26/27: Skip text inside style, script, math, annotation elements
                    // Check if any ancestor should be excluded
                    let parent = node.parentElement;
                    while (parent && parent !== element) {
                        const tag = parent.tagName.toUpperCase();
                        // Skip style/script content
                        if (tag === 'STYLE' || tag === 'SCRIPT') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        // Skip math elements (MathML) - note: MathML tags may be lowercase in some environments
                        if (tag === 'MATH' || tag === 'ANNOTATION' || tag === 'ANNOTATION-XML') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        // Skip common math renderer containers
                        if (parent.classList && (
                            parent.classList.contains('mwe-math-element') ||
                            parent.classList.contains('mwe-math-fallback-image-inline') ||
                            parent.classList.contains('mwe-math-fallback-image-display') ||
                            parent.classList.contains('katex') ||
                            parent.classList.contains('MathJax') ||
                            parent.classList.contains('MathJax_Display')
                        )) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        while ((node = walker.nextNode())) {
            // Clarified semantics (Issue 24):
            // - Keep text nodes that contain any non-whitespace characters
            // - Drop whitespace-only nodes to avoid alignment drift when mapping translations
            if (node.textContent && node.textContent.trim().length > 0) {
                textNodes.push(node);
            }
        }

        return textNodes;
    }

    /**
     * Apply translations to corresponding text nodes
     * Preserves HTML structure while replacing text content
     * 
     * @param {Text[]} textNodes - Array of text nodes to update
     * @param {string[]} translations - Array of translated strings (same order as textNodes)
     */
    static applyTranslationToTextNodes(textNodes, translations) {
        const len = Math.min(textNodes.length, translations.length);
        
        for (let i = 0; i < len; i++) {
            if (textNodes[i] && translations[i] !== undefined) {
                textNodes[i].textContent = translations[i];
            }
        }
        // Text nodes beyond translations.length are left unchanged
    }
}

// Node.js test support (no effect in extension runtime)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMUtils };
}
