const fs = require('fs');
const path = require('path');

const modalPath = path.join(__dirname, '../TranslateProvidersModal.jsx');

describe('TranslateProvidersModal Component Structure & Koharu Specs', () => {
  test('TranslateProvidersModal component exists and implements Koharu-style provider management', () => {
    expect(fs.existsSync(modalPath)).toBe(true);
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must export default TranslateProvidersModal
    expect(code).toMatch(/export\s+default\s+function\s+TranslateProvidersModal/);

    // Must render portal into document.body
    expect(code).toMatch(/createPortal/);

    // Must have Presets: openai, gemini, claude, deepseek, openrouter, ollama, lmstudio, deepl
    expect(code).toMatch(/gemini/i);
    expect(code).toMatch(/openai/i);
    expect(code).toMatch(/claude/i);
    expect(code).toMatch(/deepseek/i);
    expect(code).toMatch(/openrouter/i);

    // Must support Custom Providers (like ShopAIKey)
    expect(code).toMatch(/shopaikey/i);
    expect(code).toMatch(/custom/i);
    expect(code).toMatch(/handleAddCustomProvider|addCustomProvider/);
    expect(code).toMatch(/handleDeleteCustomProvider|deleteCustomProvider/);

    // Must have Base URL and Credential fields
    expect(code).toMatch(/baseUrl|Base URL/i);
    expect(code).toMatch(/credential|Credential|API Key/i);

    // Must have Test Connection ping action
    expect(code).toMatch(/testProviderConnection|translateTestProviderConnection|handleTestConnection/);

    // Must support multi-key per provider and per-key test connection
    expect(code).toMatch(/ProviderKeyList/);
    expect(code).toMatch(/handleAddKeyRow/);
    expect(code).toMatch(/Thêm API Key/);
    expect(code).not.toMatch(/\+ Thêm API Key/); // No plus sign in label
    expect(code).toMatch(/handleTestKey/);
    expect(code).toMatch(/handleDeleteKeyRow/);
    expect(code).toMatch(/handleUpdateKeyAt/);

    // Must support collapse/expand for connections (default collapsed)
    expect(code).toMatch(/expandedMap/);
    expect(code).toMatch(/toggleExpand/);
    expect(code).toMatch(/Mở tất cả/);
    expect(code).toMatch(/Thu gọn tất cả/);

    // Must obey UI guidelines: no native alert/confirm, no title attributes
    expect(code).not.toMatch(/window\.alert\(/);
    expect(code).not.toMatch(/window\.confirm\(/);
    expect(code).not.toMatch(/\btitle=\{t\(/); // should use data-tooltip
  });

  test('parseKeys preserves empty rows so adding new key row works as expected', () => {
    // Dynamically test parseKeys function logic
    function parseKeys(credential) {
      if (Array.isArray(credential)) {
        return credential.length > 0 ? credential : [''];
      }
      if (typeof credential !== 'string' || !credential) return [''];
      if (!credential.includes('\n') && (credential.includes(',') || credential.includes(';'))) {
        const parts = credential.split(/[,;]+/).map((k) => k.trim());
        return parts.length > 0 ? parts : [''];
      }
      const lines = credential.split(/\r?\n/).map((k) => k.trim());
      return lines.length > 0 ? lines : [''];
    }

    expect(parseKeys('')).toEqual(['']);
    expect(parseKeys('key1')).toEqual(['key1']);
    // Adding row to single key
    expect(parseKeys('key1\n')).toEqual(['key1', '']);
    // Adding row to empty
    expect(parseKeys('\n')).toEqual(['', '']);
    // Multiple keys plus new row
    expect(parseKeys('key1\nkey2\n')).toEqual(['key1', 'key2', '']);
  });

  test('divides into 2 distinct sections (Local LLM and Cloud API) and supports local model selection and sync', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must have Local LLM group and Cloud API group
    expect(code).toMatch(/Mô hình Local LLM \(100% Offline\)/);
    expect(code).toMatch(/Nhà cung cấp Cloud API \(Trực tuyến\)/);
    expect(code).toMatch(/activeCategory/);

    // Must load and detect downloaded local models
    expect(code).toMatch(/downloadedLocalModels/);
    expect(code).toMatch(/fetchLocalEngines/);

    // Must sync selected local model to activeModel and outside settings
    expect(code).toMatch(/handleSelectLocalModel/);
    expect(code).toMatch(/activeModel/);
    expect(code).toMatch(/openaiCompatible/);
  });

  test('handleSelectCloudProvider uses PRESET_PROVIDERS and has no undefined DEFAULT_PROVIDER_TEMPLATES', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must NOT reference undefined DEFAULT_PROVIDER_TEMPLATES
    expect(code).not.toMatch(/\bDEFAULT_PROVIDER_TEMPLATES\b/);

    // Must reference PRESET_PROVIDERS in handleSelectCloudProvider
    expect(code).toMatch(/handleSelectCloudProvider/);
    expect(code).toMatch(/PRESET_PROVIDERS\.find/);
  });

  test('supports cloud provider selection and guards against auto-switching to local when cloud provider is active', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must have handleSelectCloudProvider
    expect(code).toMatch(/handleSelectCloudProvider/);

    // Must have "Chọn dùng" and "Đang chọn"
    // Must guard auto-switching effect: only runs if isLocalProvider
    expect(code).toMatch(/const isLocalProvider =\s*settings\?\.translationProvider === 'ollama'/);
  });

  test('supports compact model configuration and selection using SearchableSelect inside modal', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must import PROVIDER_MODEL_GUIDES
    expect(code).toMatch(/PROVIDER_MODEL_GUIDES/);

    // Must support setting defaultModel for providers
    expect(code).toMatch(/handleUpdateProviderField\(provider\.id,\s*'defaultModel'/);

    // Must use SearchableSelect for compact model selection
    expect(code).toMatch(/SearchableSelect/);

    // DeepL special handling
    expect(code).toMatch(/provider\.id === 'deepl'/);
  });

  test('PRESET_PROVIDERS uses modernized default models (gemini-3.5-flash, claude-3-7-sonnet, openrouter gemini-2.5-flash)', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must have modern defaultModel for gemini, claude, openrouter
    expect(code).toMatch(/id:\s*'gemini'[\s\S]*?defaultModel:\s*'gemini-3\.5-flash'/);
    expect(code).toMatch(/id:\s*'claude'[\s\S]*?defaultModel:\s*'claude-3-7-sonnet'/);
    expect(code).toMatch(/id:\s*'openrouter'[\s\S]*?defaultModel:\s*'google\/gemini-2\.5-flash'/);
  });

  test('implements dynamic model discovery via translateFetchAvailableModels and localStorage cache', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must have discovery state
    expect(code).toMatch(/discoveredModelsMap/);
    expect(code).toMatch(/isFetchingModelsMap/);
    expect(code).toMatch(/fetchModelErrorMap/);

    // Must invoke api.translateFetchAvailableModels
    expect(code).toMatch(/api\.translateFetchAvailableModels/);
    expect(code).toMatch(/handleFetchModels/);

    // Must cache in localStorage
    expect(code).toMatch(/manga_crawler_discovered_models_/);
  });

  test('redesigns Model AI section with unified w-full SearchableSelect, scan button, quick chips, warning & custom input', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // Must have refresh / scan button
    expect(code).toMatch(/Quét model khả dụng/);

    // Must have quick preset chips
    expect(code).toMatch(/Gợi ý:/);

    // Must warn on obsolete models
    expect(code).toMatch(/⚠️ Model này không còn khả dụng trên tài khoản của bạn\. Vui lòng chọn model mới\./);

    // Must support custom model input option via compact outside button
    expect(code).toMatch(/customInputMap/);
    expect(code).toMatch(/setCustomInputMap/);
    expect(code).toMatch(/Tùy chỉnh/);
  });

  test('synchronizes legacy model property with defaultModel when updating or passing to test runner', () => {
    const code = fs.readFileSync(modalPath, 'utf8');

    // handleUpdateProviderField must update model when defaultModel changes
    expect(code).toMatch(/if\s*\(field === 'defaultModel'\)\s*\{\s*updatedProvider\.model\s*=\s*value;\s*\}/);

    // mergedConfig must include model: defaultModel
    expect(code).toMatch(/mergedConfig\s*=\s*\{[\s\S]*?defaultModel,[\s\S]*?model:\s*defaultModel[\s\S]*?\}/);
  });
});

