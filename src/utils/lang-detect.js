/**
 * Language Detection for Immersive Translate Clone
 * 
 * This module provides simple heuristic-based language detection
 * to skip translating content that's already in the target language.
 * 
 * Usage:
 * - Extension runtime: globalThis.LangDetect
 * - Jest tests: require('./lang-detect.js')
 */

// CJK (Chinese-Japanese-Korean) character ranges
// Primary CJK Unified Ideographs: U+4E00-U+9FFF
// CJK Extension A: U+3400-U+4DBF
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
const LANGUAGE_CHAR_PATTERN = /[A-Za-z\u4e00-\u9fff\u3400-\u4dbf]/g;
const DEFAULT_CJK_THRESHOLD = 0.6;

function getCJKThreshold(options) {
    const value = options && options.cjkThreshold;
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
        return DEFAULT_CJK_THRESHOLD;
    }
    return parsed;
}

/**
 * Detect the language of a text string
 * Uses simple CJK character ratio to determine if text is Chinese
 * 
 * @param {string} text - Text to analyze
 * @param {Object} [options] - Detection options
 * @param {number} [options.cjkThreshold=0.6] - CJK ratio needed to classify as Chinese
 * @returns {string} 'zh' for Chinese, 'other' for everything else
 */
function detectLanguage(text, options = {}) {
    if (!text || typeof text !== 'string') {
        return 'other';
    }
    
    const languageChars = text.match(LANGUAGE_CHAR_PATTERN) || [];
    
    if (languageChars.length === 0) {
        return 'other';
    }
    
    // Count CJK characters
    const matches = text.match(CJK_PATTERN) || [];
    const cjkRatio = matches.length / languageChars.length;
    
    // Threshold: only skip when the segment is mostly CJK.
    if (cjkRatio >= getCJKThreshold(options)) {
        return 'zh';
    }
    
    return 'other';
}

/**
 * Determine if translation should be skipped based on detected language
 * 
 * @param {string} text - Text to check
 * @param {string} targetLang - Target language code (default: 'zh')
 * @param {Object} [options] - Language gate options
 * @param {boolean} [options.enabled=true] - Whether language gating is active
 * @param {number} [options.cjkThreshold=0.6] - CJK ratio needed to classify as Chinese
 * @returns {boolean} True if translation should be skipped
 */
function shouldSkipTranslation(text, targetLang = 'zh', options = {}) {
    if (options && options.enabled === false) {
        return false;
    }

    const detected = detectLanguage(text, options);
    
    // Simple matching: if detected language matches target, skip
    // For now, we only detect 'zh' vs 'other'
    if (targetLang === 'zh' || targetLang === 'zh-CN' || targetLang === 'zh-TW') {
        return detected === 'zh';
    }
    
    // For other target languages, we can't reliably detect
    // so we default to not skipping (translate everything non-Chinese)
    // This is a limitation of the simple detector
    return false;
}

/**
 * Get CJK character ratio for debugging/testing
 * @param {string} text - Text to analyze
 * @returns {number} Ratio of CJK characters (0-1)
 */
function getCJKRatio(text) {
    if (!text || typeof text !== 'string') {
        return 0;
    }
    
    const languageChars = text.match(LANGUAGE_CHAR_PATTERN) || [];
    if (languageChars.length === 0) {
        return 0;
    }
    
    const matches = text.match(CJK_PATTERN) || [];
    return matches.length / languageChars.length;
}

// Export for both browser (globalThis) and Node.js (module.exports)
const LangDetect = {
    detectLanguage,
    shouldSkipTranslation,
    getCJKRatio,
    DEFAULT_CJK_THRESHOLD
};

// Node.js / Jest support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LangDetect;
}

// Browser / Extension runtime support
if (typeof globalThis !== 'undefined') {
    globalThis.LangDetect = LangDetect;
}
