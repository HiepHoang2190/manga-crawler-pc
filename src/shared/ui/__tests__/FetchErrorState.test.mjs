import fs from 'node:fs';
import path from 'node:path';
import { classifyFetchError } from '../fetchErrorUtils.js';

const root = process.cwd();
const sharedIndexPath = path.join(root, 'src/shared/index.js');
const componentPath = path.join(root, 'src/shared/ui/FetchErrorState.jsx');
const viPath = path.join(root, 'src/i18n/locales/vi.js');
const enPath = path.join(root, 'src/i18n/locales/en.js');

describe('classifyFetchError', () => {
  test('classifies VPN / geo-block messages as vpn with vpn_lock icon', () => {
    const res = classifyFetchError(
      'CuuTruyen: API mới cập nhật: Lỗi mạng (fetch). Vui lòng bật VPN hoặc 1.1.1.1 (Warp) nếu bạn đang ở Việt Nam vì trang này có thể chặn IP VN.',
    );
    expect(res).toMatchObject({
      kind: 'vpn',
      icon: 'vpn_lock',
      titleKey: 'fetchError.titleVpn',
      hintKey: 'fetchError.hintVpn',
    });
  });

  test('promotes generic network error to vpn when requiresVpn or suggestsVpn is true', () => {
    expect(classifyFetchError('Lỗi mạng khi fetch trang', { requiresVpn: true })).toMatchObject({
      kind: 'vpn',
      icon: 'vpn_lock',
    });
    expect(classifyFetchError('fetch failed', { suggestsVpn: true })).toMatchObject({
      kind: 'vpn',
      icon: 'vpn_lock',
    });
  });

  test('classifies Cloudflare / Cookie / 403 / 401 errors as auth with shield_lock icon', () => {
    expect(classifyFetchError('HTTP 403 Cloudflare blocked')).toMatchObject({
      kind: 'auth',
      icon: 'shield_lock',
      titleKey: 'fetchError.titleAuth',
      hintKey: 'fetchError.hintAuth',
    });
    expect(classifyFetchError('Missing cookie or token expired')).toMatchObject({
      kind: 'auth',
      icon: 'shield_lock',
    });
  });

  test('classifies network / timeout errors as network with wifi_off icon', () => {
    expect(classifyFetchError('Request ETIMEDOUT connecting to host')).toMatchObject({
      kind: 'network',
      icon: 'wifi_off',
      titleKey: 'fetchError.titleNetwork',
      hintKey: 'fetchError.hintNetwork',
    });
    expect(classifyFetchError('Lỗi mạng (fetch failed)')).toMatchObject({
      kind: 'network',
      icon: 'wifi_off',
    });
  });

  test('falls back to server / default category with cloud_off icon', () => {
    expect(classifyFetchError('HTTP 500 Internal Server Error')).toMatchObject({
      kind: 'server',
      icon: 'cloud_off',
      titleKey: 'fetchError.titleDefault',
      hintKey: null,
    });
    expect(classifyFetchError('')).toMatchObject({
      kind: 'server',
      icon: 'cloud_off',
    });
  });
});

describe('FetchErrorState component & i18n parity', () => {
  const sharedIndex = fs.readFileSync(sharedIndexPath, 'utf8');
  const component = fs.readFileSync(componentPath, 'utf8');
  const vi = fs.readFileSync(viPath, 'utf8');
  const en = fs.readFileSync(enPath, 'utf8');

  test('exports FetchErrorState and classifyFetchError from src/shared/index.js', () => {
    expect(sharedIndex).toContain('FetchErrorState');
    expect(sharedIndex).toContain('classifyFetchError');
  });

  test('implements accessible centered error card following UI standards (no native title, no underline)', () => {
    expect(component).toContain('data-testid="fetch-error-state"');
    expect(component).toContain('role="alert"');
    expect(component).toContain('onRetry');
    expect(component).toContain('heading');
    expect(component).toContain('sourceLabel');
    expect(component).toContain('multiErrors');
    expect(component).toContain('secondaryAction');
    expect(component).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(component).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('vi.js and en.js define all required fetchError.* keys', () => {
    const keys = [
      'fetchError.retry',
      'fetchError.titleVpn',
      'fetchError.titleNetwork',
      'fetchError.titleAuth',
      'fetchError.titleDefault',
      'fetchError.hintVpn',
      'fetchError.hintNetwork',
      'fetchError.hintAuth',
      'fetchError.detailLabel',
    ];
    for (const key of keys) {
      expect(vi).toContain(`'${key}':`);
      expect(en).toContain(`'${key}':`);
    }
  });
});
