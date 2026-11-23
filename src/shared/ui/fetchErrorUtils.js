/**
 * Classify raw fetch/network/connector errors into consistent UI categories
 * with icon and localized guidance keys.
 *
 * @param {string} [message]
 * @param {object} [options]
 * @param {boolean} [options.requiresVpn]
 * @param {boolean} [options.suggestsVpn]
 * @returns {{ kind: 'vpn'|'auth'|'network'|'server', icon: string, titleKey: string, hintKey: string|null }}
 */
export function classifyFetchError(message = '', options = {}) {
  const text = String(message || '').trim();
  const { requiresVpn = false, suggestsVpn = false } = options || {};

  if (/\bvpn\b|1\.1\.1\.1|\bwarp\b|chặn ip|geo[- ]?block/i.test(text)) {
    return {
      kind: 'vpn',
      icon: 'vpn_lock',
      titleKey: 'fetchError.titleVpn',
      hintKey: 'fetchError.hintVpn',
    };
  }

  if (/cloudflare|cf_clearance|cookie|\b403\b|\b401\b|forbidden|captcha|xác thực/i.test(text)) {
    return {
      kind: 'auth',
      icon: 'shield_lock',
      titleKey: 'fetchError.titleAuth',
      hintKey: 'fetchError.hintAuth',
    };
  }

  if (/lỗi mạng|fetch failed|failed to fetch|network|econn|enotfound|etimedout|timeout|socket|dns|\(fetch\)/i.test(text)) {
    if (requiresVpn || suggestsVpn) {
      return {
        kind: 'vpn',
        icon: 'vpn_lock',
        titleKey: 'fetchError.titleVpn',
        hintKey: 'fetchError.hintVpn',
      };
    }
    return {
      kind: 'network',
      icon: 'wifi_off',
      titleKey: 'fetchError.titleNetwork',
      hintKey: 'fetchError.hintNetwork',
    };
  }

  if (requiresVpn && text) {
    return {
      kind: 'vpn',
      icon: 'vpn_lock',
      titleKey: 'fetchError.titleVpn',
      hintKey: 'fetchError.hintVpn',
    };
  }

  return {
    kind: 'server',
    icon: 'cloud_off',
    titleKey: 'fetchError.titleDefault',
    hintKey: null,
  };
}
