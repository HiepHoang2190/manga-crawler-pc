const path = require('path');
const fs = require('fs');

const guidesFile = path.join(__dirname, '../constants/providerModelGuides.js');

function loadGuides() {
  const code = fs.readFileSync(guidesFile, 'utf8');
  const cleanCode = code
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/if\s*\(typeof module[\s\S]*$/, '');
  const fn = new Function(`${cleanCode}\nreturn Object.assign(PROVIDER_MODEL_GUIDES, { PREDEFINED_LOCAL_MODEL_META });`);
  return fn();
}

describe('PROVIDER_MODEL_GUIDES — Model Recommendations and Explanations for Providers', () => {
  test('constants file exists and exports PROVIDER_MODEL_GUIDES', () => {
    expect(fs.existsSync(guidesFile)).toBe(true);
    const PROVIDER_MODEL_GUIDES = loadGuides();

    expect(PROVIDER_MODEL_GUIDES).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.gemini).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.openai).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.claude).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.deepseek).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.openrouter).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.ollama).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.lmstudio).toBeDefined();
    expect(PROVIDER_MODEL_GUIDES.deepl).toBeDefined();
  });

  test('each LLM provider has recommended model and model explanations', () => {
    const PROVIDER_MODEL_GUIDES = loadGuides();
    const llmProviders = ['gemini', 'openai', 'claude', 'deepseek', 'openrouter', 'ollama', 'lmstudio'];

    for (const pId of llmProviders) {
      const guide = PROVIDER_MODEL_GUIDES[pId];
      expect(guide.name).toBeTruthy();
      expect(guide.note).toBeTruthy();
      expect(Array.isArray(guide.models)).toBe(true);
      expect(guide.models.length).toBeGreaterThan(0);

      // Must have at least one recommended model
      expect(guide.recommended).toBeTruthy();
      const hasRecommended = guide.models.some((m) => m.id === guide.recommended);
      expect(hasRecommended).toBe(true);

      // Every model must have id, name, badge, and description
      for (const m of guide.models) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.badge).toBeTruthy();
        expect(m.desc).toBeTruthy();
      }
    }
  });

  test('DeepL is marked as special without requiring LLM models', () => {
    const PROVIDER_MODEL_GUIDES = loadGuides();
    const deeplGuide = PROVIDER_MODEL_GUIDES.deepl;
    expect(deeplGuide.isSpecial).toBe(true);
    expect(deeplGuide.note).toContain('DeepL');
    expect(deeplGuide.models).toEqual([]);
  });

  test('exports PREDEFINED_LOCAL_MODEL_META with friendly names and badges', () => {
    const guides = loadGuides();
    const meta = guides.PREDEFINED_LOCAL_MODEL_META;
    expect(meta).toBeDefined();
    expect(meta['qwen2.5:7b'].name).toBe('Qwen 2.5 7B Instruct');
    expect(meta['gemma4:12b'].name).toBe('Gemma 4 12B Instruct');
  });

  test('reflects active models and updated recommendations for gemini, claude, and openrouter', () => {
    const guides = loadGuides();

    // Gemini
    expect(guides.gemini.recommended).toBe('gemini-3.5-flash');
    const geminiIds = guides.gemini.models.map((m) => m.id);
    expect(geminiIds).toEqual(
      expect.arrayContaining(['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-lite-latest'])
    );
    expect(geminiIds).not.toContain('gemini-1.5-flash');
    expect(geminiIds).not.toContain('gemini-2.0-flash');
    expect(geminiIds).not.toContain('gemini-2.5-flash');

    // Claude
    expect(guides.claude.recommended).toBe('claude-3-7-sonnet');
    const claudeIds = guides.claude.models.map((m) => m.id);
    expect(claudeIds).toEqual(
      expect.arrayContaining(['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'])
    );
    expect(claudeIds).not.toContain('claude-3-5-sonnet-20240620');

    // OpenRouter
    expect(guides.openrouter.recommended).toBe('google/gemini-2.5-flash');
    const openrouterIds = guides.openrouter.models.map((m) => m.id);
    expect(openrouterIds).toEqual(
      expect.arrayContaining([
        'google/gemini-2.5-flash',
        'deepseek/deepseek-chat',
        'meta-llama/llama-3.3-70b-instruct:free',
      ])
    );
    expect(openrouterIds).not.toContain('google/gemini-2.0-flash-exp:free');
  });
});
