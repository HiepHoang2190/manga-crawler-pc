const {
  PACKAGE_APP,
  hasApp,
  defaultExpiresAtIso,
} = require('../../auth/packageEntitlements');

describe('packageEntitlements', () => {
  const now = Date.parse('2026-08-20T00:00:00Z');

  test('app package grants app access', () => {
    const session = {
      userType: 'Member',
      entitlements: [{ packageKey: PACKAGE_APP, expiresAt: null }],
    };
    expect(hasApp(session, now)).toBe(true);
  });

  test('expired app is inactive', () => {
    const session = {
      entitlements: [{ packageKey: PACKAGE_APP, expiresAt: '2026-08-19T00:00:00Z' }],
    };
    expect(hasApp(session, now)).toBe(false);
  });

  test('admin bypasses all packages', () => {
    expect(hasApp({ isAdmin: true, entitlements: [] }, now)).toBe(true);
    expect(hasApp({ userType: 'Admin', entitlements: [] }, now)).toBe(true);
  });

  test('app default expiry is lifetime', () => {
    expect(defaultExpiresAtIso(PACKAGE_APP, new Date(now))).toBe(null);
  });

  test('later active package row grants access', () => {
    const session = {
      entitlements: [
        { packageKey: PACKAGE_APP, expiresAt: '2026-08-19T00:00:00Z' },
        { packageKey: PACKAGE_APP, expiresAt: '2026-08-21T00:00:00Z' },
      ],
    };

    expect(hasApp(session, now)).toBe(true);
  });

  test('legacy member sessions without entitlements still have app', () => {
    expect(hasApp({ userType: 'Super Member' }, now)).toBe(true);
    expect(hasApp({ userType: 'Premium Member' }, now)).toBe(true);
    expect(hasApp({ userType: 'Member' }, now)).toBe(true);
  });

  test('explicit empty entitlements do not fall back to userType ladder', () => {
    const session = { userType: 'Member', entitlements: [] };
    expect(hasApp(session, now)).toBe(false);
  });
});

