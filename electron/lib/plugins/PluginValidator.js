/**
 * PluginValidator - Validates JavaScript plugin structure and metadata
 * 
 * Ensures plugins meet security and structural requirements before loading.
 */

const vm = require('vm');

class PluginValidator {
  /**
   * Normalize plugin id for storage and connector registry (cross-platform file basename).
   * @param {unknown} raw
   * @returns {string}
   */
  static _normalizePluginId(raw) {
    let s = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!s) return '';
    // spaces and punctuation → single hyphen
    s = s.replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');
    s = s.replace(/^-+|-+$/g, '');
    return s;
  }

  /**
   * Validate plugin source code
   * @param {string} source - Plugin source code
   * @returns {Object} Validation result { isValid, errorMessage, metadata }
   */
  validate(source) {
    if (!source || typeof source !== 'string') {
      return this._fail('Plugin source must be a non-empty string.');
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /require\s*\(/,
      /process\./,
      /child_process/,
      /fs\./,
      /eval\s*\(/,
      /Function\s*\(/,
      /__dirname/,
      /__filename/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(source)) {
        return this._fail(`Plugin contains forbidden pattern: ${pattern.source}`);
      }
    }

    // Try to parse and extract metadata
    try {
      const metadata = this._extractMetadata(source);
      return this._ok(metadata);
    } catch (e) {
      return this._fail(`Failed to extract metadata: ${e.message}`);
    }
  }

  /**
   * Extract and validate plugin metadata
   */
  _extractMetadata(source) {
    // Create a safe sandbox to evaluate the plugin
    const sandbox = {
      plugin: null,
      console: {
        log: () => {},
        warn: () => {},
        error: () => {}
      }
    };

    // Evaluate the plugin source in the sandbox
    const script = new vm.Script(source);
    const context = vm.createContext(sandbox);
    script.runInContext(context, { timeout: 1000 });

    // Top-level `const`/`let plugin = {...}` does not assign `sandbox.plugin` in vm
    // (only `var` does). Read the binding from the same context, matching mobile engines.
    const extractScript = new vm.Script(
      '(function(){ ' +
        'if (typeof plugin !== "undefined" && plugin !== null) return plugin; ' +
        'return null; ' +
        '})()'
    );
    const plugin = extractScript.runInContext(context, { timeout: 1000 });
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Plugin must export a "plugin" object at the top level.');
    }

    // Validate required fields
    const required = ['id', 'name', 'version', 'author', 'description', 'baseUrl'];
    for (const field of required) {
      if (!plugin[field] || typeof plugin[field] !== 'string') {
        throw new Error(`Plugin missing required field: ${field}`);
      }
    }

    // Normalize id (filename-safe, matches connector site ids); then validate
    const normalizedId = PluginValidator._normalizePluginId(plugin.id);
    if (!normalizedId) {
      throw new Error('Plugin id cannot be empty.');
    }
    if (!/^[a-z0-9_-]+$/.test(normalizedId)) {
      throw new Error(
        'Plugin id must use only lowercase letters, digits, hyphen and underscore (e.g. my-site, site_v2).',
      );
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(plugin.version)) {
      throw new Error('Plugin version must be in format major.minor.patch (e.g., 1.0.0)');
    }

    // Validate baseUrl is HTTPS
    if (!plugin.baseUrl.startsWith('https://')) {
      throw new Error('Plugin baseUrl must use HTTPS protocol.');
    }

    // Validate allowedDomains
    if (!Array.isArray(plugin.allowedDomains) || plugin.allowedDomains.length === 0) {
      throw new Error('Plugin must specify allowedDomains array with at least one domain.');
    }

    // Validate required functions
    const requiredFunctions = ['fetchManga', 'fetchChapterImages'];
    for (const funcName of requiredFunctions) {
      if (typeof plugin[funcName] !== 'function') {
        throw new Error(`Plugin must implement ${funcName} function.`);
      }
    }

    // Extract metadata
    return {
      id: normalizedId,
      name: plugin.name,
      version: plugin.version,
      author: plugin.author,
      description: plugin.description,
      baseUrl: plugin.baseUrl,
      allowedDomains: plugin.allowedDomains,
      icon: plugin.icon || null,
      requestsPerSecond: plugin.requestsPerSecond || 2.0,
      burstSize: plugin.burstSize || 5,
      homepage: plugin.homepage || null,
      supportUrl: plugin.supportUrl || null,
      changelog: plugin.changelog || null,
      tags: plugin.tags || [],
      disabled: plugin.disabled || false
    };
  }

  _ok(metadata) {
    return {
      isValid: true,
      metadata
    };
  }

  _fail(message, line = null) {
    return {
      isValid: false,
      errorMessage: message,
      errorLine: line
    };
  }
}

module.exports = PluginValidator;
