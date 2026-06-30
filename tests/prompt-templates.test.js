/**
 * Tests for Issue 17: Prompt Separation (Protocol vs User Translation)
 * 
 * These tests verify that:
 * 1. PROTOCOL_PROMPT is always included and not editable
 * 2. User prompts are correctly merged with protocol
 * 3. Migration from old customPrompt works correctly
 * 
 * Note: These tests will FAIL until src/utils/prompt-templates.js is implemented.
 */

describe('prompt-templates', () => {
  let PromptTemplates;

  beforeEach(() => {
    jest.resetModules();
    try {
      PromptTemplates = require('../src/utils/prompt-templates.js');
    } catch (e) {
      // Module not yet implemented
      PromptTemplates = null;
    }
  });

  describe('PROTOCOL_PROMPT constant', () => {
    test('should be defined', () => {
      expect(PromptTemplates).not.toBeNull();
      expect(PromptTemplates.PROTOCOL_PROMPT).toBeDefined();
    });

    test('should contain SEG marker identity rules instead of %% separator rules', () => {
      expect(PromptTemplates).not.toBeNull();
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('⟦⟦SEG:0⟧⟧');
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('⟦⟦SEG:1⟧⟧');
      expect(PromptTemplates.PROTOCOL_PROMPT).toMatch(/same segment ID/i);
      expect(PromptTemplates.PROTOCOL_PROMPT).not.toContain('%%');
    });
    
    test('should contain output format constraints', () => {
      expect(PromptTemplates).not.toBeNull();
      // Should mention translation output rules
      expect(PromptTemplates.PROTOCOL_PROMPT.toLowerCase()).toMatch(/translat/);
    });

    test('should document RichText V2 marker + token rules', () => {
      expect(PromptTemplates).not.toBeNull();
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('[[ITC_RICH_V2]]');
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('[[ITC:a0]]');
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('[[/ITC]]');
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('[[ITC:ref0]]');
    });

    test('should preserve translate_input security wrapper guidance', () => {
      expect(PromptTemplates).not.toBeNull();
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('<translate_input>');
      expect(PromptTemplates.PROTOCOL_PROMPT).toContain('</translate_input>');
      expect(PromptTemplates.PROTOCOL_PROMPT).toMatch(/UNTRUSTED web page content/);
    });
  });

  describe('DEFAULT_USER_PROMPT constant', () => {
    test('should be defined and non-empty', () => {
      expect(PromptTemplates).not.toBeNull();
      expect(PromptTemplates.DEFAULT_USER_PROMPT).toBeDefined();
      expect(PromptTemplates.DEFAULT_USER_PROMPT.length).toBeGreaterThan(0);
    });
  });

  describe('buildSystemPrompt()', () => {
    test('should always include PROTOCOL_PROMPT at the start', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ userPrompt: 'custom' });
      expect(result.startsWith(PromptTemplates.PROTOCOL_PROMPT.substring(0, 20))).toBe(true);
    });

    test('should append user prompt after PROTOCOL_PROMPT', () => {
      expect(PromptTemplates).not.toBeNull();
      const userPrompt = 'Translate formally.';
      const result = PromptTemplates.buildSystemPrompt({ userPrompt });
      expect(result).toContain(userPrompt);
      // User prompt should come after protocol
      const protocolEnd = result.indexOf(PromptTemplates.PROTOCOL_PROMPT.substring(0, 20)) + 20;
      const userStart = result.indexOf(userPrompt);
      expect(userStart).toBeGreaterThan(protocolEnd);
    });

    test('should use DEFAULT_USER_PROMPT when userPrompt is empty string', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ userPrompt: '' });
      expect(result).toContain(PromptTemplates.DEFAULT_USER_PROMPT);
    });

    test('should use DEFAULT_USER_PROMPT when userPrompt is null', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ userPrompt: null });
      expect(result).toContain(PromptTemplates.DEFAULT_USER_PROMPT);
    });

    test('should use DEFAULT_USER_PROMPT when userPrompt is undefined', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({});
      expect(result).toContain(PromptTemplates.DEFAULT_USER_PROMPT);
    });
  });

  describe('buildSystemPrompt() with target language', () => {
    test('should replace {{TARGET_LANG}} placeholder with language name', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ 
        userPrompt: 'test', 
        targetLanguage: 'en' 
      });
      // Should not contain the raw placeholder
      expect(result).not.toContain('{{TARGET_LANG}}');
    });

    test('should default to Simplified Chinese if target language not specified', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ userPrompt: 'test' });
      // Should contain Chinese-related text or zh-CN
      expect(result.toLowerCase()).toMatch(/chinese|中文|zh/);
    });

    test('should handle zh-TW target language', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ 
        userPrompt: 'test', 
        targetLanguage: 'zh-TW' 
      });
      expect(result.toLowerCase()).toMatch(/traditional|繁體|zh-tw/i);
    });

    test('should handle English target language', () => {
      expect(PromptTemplates).not.toBeNull();
      const result = PromptTemplates.buildSystemPrompt({ 
        userPrompt: 'test', 
        targetLanguage: 'en' 
      });
      expect(result.toLowerCase()).toMatch(/english/);
    });
  });

  describe('migrateCustomPrompt()', () => {
    test('should be a function', () => {
      expect(PromptTemplates).not.toBeNull();
      expect(typeof PromptTemplates.migrateCustomPrompt).toBe('function');
    });

    test('should migrate non-empty customPrompt to userTranslationPrompt', () => {
      expect(PromptTemplates).not.toBeNull();
      const oldConfig = { customPrompt: 'My custom translation style' };
      const result = PromptTemplates.migrateCustomPrompt(oldConfig);
      expect(result.userTranslationPrompt).toBe('My custom translation style');
    });

    test('should not overwrite existing userTranslationPrompt', () => {
      expect(PromptTemplates).not.toBeNull();
      const oldConfig = { 
        customPrompt: 'old value',
        userTranslationPrompt: 'existing value'
      };
      const result = PromptTemplates.migrateCustomPrompt(oldConfig);
      expect(result.userTranslationPrompt).toBe('existing value');
    });

    test('should handle missing customPrompt gracefully', () => {
      expect(PromptTemplates).not.toBeNull();
      const oldConfig = {};
      const result = PromptTemplates.migrateCustomPrompt(oldConfig);
      // Should not throw and should return valid config
      expect(result).toBeDefined();
    });

    test('should mark customPrompt for deletion', () => {
      expect(PromptTemplates).not.toBeNull();
      const oldConfig = { customPrompt: 'something' };
      const result = PromptTemplates.migrateCustomPrompt(oldConfig);
      // After migration, customPrompt should be undefined or explicitly null
      expect(result.customPrompt === undefined || result.customPrompt === null).toBe(true);
    });

     test('should migrate user additions from old default prompt without legacy %% protocol rules', () => {
       expect(PromptTemplates).not.toBeNull();
       expect(PromptTemplates.OLD_DEFAULT_PROMPT).toBeDefined();

       const modified = PromptTemplates.OLD_DEFAULT_PROMPT + '\n\n# User tweak: keep more literal tone.';
       const result = PromptTemplates.migrateCustomPrompt({ customPrompt: modified });

       expect(result.userTranslationPrompt).toContain('User tweak: keep more literal tone.');
       expect(result.userTranslationPrompt).not.toContain('%%');
       expect(result.userTranslationPrompt).not.toContain('OUTPUT FORMAT');
     });

     test('should NOT migrate when customPrompt equals OLD_DEFAULT_PROMPT exactly (Issue 22)', () => {
       expect(PromptTemplates).not.toBeNull();
       const result = PromptTemplates.migrateCustomPrompt({ customPrompt: PromptTemplates.OLD_DEFAULT_PROMPT });
       expect(result.userTranslationPrompt).toBeUndefined();
     });
  });
});
