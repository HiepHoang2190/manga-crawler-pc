const fs = require('fs');
const path = require('path');

const panelPath = path.join(__dirname, '../TranslateSettingsPanel.jsx');

describe('TranslateSettingsPanel — Unified Engine & Providers Modal Integration', () => {
  test('TranslateSettingsPanel imports and integrates TranslateProvidersModal', () => {
    expect(fs.existsSync(panelPath)).toBe(true);
    const code = fs.readFileSync(panelPath, 'utf8');

    // Must import TranslateProvidersModal
    expect(code).toMatch(/TranslateProvidersModal/);

    // Must have state for showProvidersModal
    expect(code).toMatch(/showProvidersModal/);

    // Must render SearchableSelect for provider selection
    expect(code).toMatch(/SearchableSelect/);

    // Must have quick ping test button
    expect(code).toMatch(/testProviderConnection|translateTestProviderConnection|handleQuickTest/);

    // Must mount TranslateProvidersModal with isOpen and onClose
    expect(code).toMatch(/<TranslateProvidersModal/);
  });

  test('TranslateSettingsPanel adheres to unified dropdown standards: no native <select> tags', () => {
    const code = fs.readFileSync(panelPath, 'utf8');

    // Rule: CẤM dùng thẻ <select> native của HTML
    expect(code).not.toMatch(/<select/);

    // Rule: BẮT BUỘC sử dụng component dùng chung SearchableSelect
    expect(code).toMatch(/<SearchableSelect/);
  });

  test('TranslateSettingsPanel passes groups prop and has no undefined isLocalEngineOnline references', () => {
    const code = fs.readFileSync(panelPath, 'utf8');

    // Must pass providerSelectGroups to SearchableSelect
    expect(code).toMatch(/groups=\{providerSelectGroups\}/);

    // Must define isLocalOnline from localEngines
    expect(code).toMatch(/const isLocalOnline = Boolean/);

    // Must NOT have unreferenced isLocalEngineOnline
    expect(code).not.toMatch(/\bisLocalEngineOnline\b/);
  });

  test('TranslateSettingsPanel cleans up legacy openai_compatible and normalizes activeProviderId', () => {
    const code = fs.readFileSync(panelPath, 'utf8');

    // Must normalize legacy openai_compatible to ollama
    expect(code).toMatch(/const activeProviderId = safeSettings\.translationProvider === 'openai_compatible'\s*\?\s*'ollama'/);

    // Must skip non-custom openai_compatible in providerSelectGroups
    expect(code).toMatch(/if \(id === 'openai_compatible' && !info\.isCustom\) continue;/);

    // Must clean up legacy openai_compatible from providers via useEffect
    expect(code).toMatch(/delete updatedProviders\.openai_compatible;/);
  });

  test('const save is defined before any useEffect that depends on it (no TDZ ReferenceError)', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    const saveIndex = code.indexOf('const save = useCallback');
    const cleanupEffectIndex = code.indexOf("hasLegacyProvider = safeSettings.translationProvider === 'openai_compatible'");
    expect(saveIndex).toBeGreaterThan(0);
    expect(cleanupEffectIndex).toBeGreaterThan(0);
    expect(saveIndex).toBeLessThan(cleanupEffectIndex);
  });

  test('TranslateSettingsPanel integrates PROVIDER_MODEL_GUIDES and provides compact model UI with link to modal', () => {
    const code = fs.readFileSync(panelPath, 'utf8');

    // Must import PROVIDER_MODEL_GUIDES
    expect(code).toMatch(/import\s+\{[^}]*PROVIDER_MODEL_GUIDES[^}]*\}\s+from/);

    // Must have compact model UI with link to Quản lý & Gợi ý model in modal
    expect(code).toMatch(/Quản lý & Gợi ý model/);
    expect(code).toMatch(/showProvidersModal/);

    // Must have special handling for DeepL
    expect(code).toMatch(/activeProviderId === 'deepl'/);
  });

  test('TranslateSettingsPanel unifies Model AI with SearchableSelect and PREDEFINED_LOCAL_MODEL_META', () => {
    const code = fs.readFileSync(panelPath, 'utf8');

    // Must import PREDEFINED_LOCAL_MODEL_META
    expect(code).toMatch(/PREDEFINED_LOCAL_MODEL_META/);

    // Must compute modelSelectOptions
    expect(code).toMatch(/modelSelectOptions/);

    // Must support prop localEngines
    expect(code).toMatch(/localEngines:\s*propLocalEngines/);

    // Must NOT have native datalist for suggested models anymore
    expect(code).not.toMatch(/<datalist/);
  });

  test('TranslateSettingsPanel modernizes fallback models and integrates discovered models from cache', () => {
    const code = fs.readFileSync(panelPath, 'utf8');

    // Must use modernized fallback models
    expect(code).toMatch(/value:\s*'gemini-3\.5-flash'/);
    expect(code).toMatch(/value:\s*'gpt-4o'/);
    expect(code).toMatch(/value:\s*'deepseek-chat'/);

    // Must not use gemini-1.5 or gemini-2.5 in fallback list
    expect(code).not.toMatch(/value:\s*'gemini-1\.5-flash'/);
    expect(code).not.toMatch(/value:\s*'gemini-2\.5-flash'/);

    // Must read cached discovered models from localStorage
    expect(code).toMatch(/manga_crawler_discovered_models_/);
  });
});


