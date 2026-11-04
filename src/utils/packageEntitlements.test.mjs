import {
  PACKAGE_APP,
  buildSessionAccessSnapshot,
  findLatestEntitlementRow,
} from './packageEntitlementView.mjs';

describe('packageEntitlements renderer helpers', () => {
  test('buildSessionAccessSnapshot normalizes session fields and entitlements', () => {
    const session_snapshot = buildSessionAccessSnapshot({
      userType: 'Member',
      isAdmin: false,
      entitlements: [
        { packageKey: PACKAGE_APP, expiresAt: null, ignored: 'x' },
        { package_key: 'custom', expires_at: '2027-08-20T00:00:00Z', ignored: 'y' },
      ],
      email: 'reader@example.com',
      refreshToken: 'secret',
    });

    expect(session_snapshot).toEqual({
      userType: 'Member',
      isAdmin: false,
      entitlements: [
        { packageKey: PACKAGE_APP, expiresAt: null },
        { packageKey: 'custom', expiresAt: '2027-08-20T00:00:00Z' },
      ],
    });
  });

  test('findLatestEntitlementRow finds the most recent entitlement for a packageKey', () => {
    const session = {
      entitlements: [
        { packageKey: PACKAGE_APP, expiresAt: '2026-01-01T00:00:00Z' },
        { package_key: PACKAGE_APP, expires_at: '2027-01-01T00:00:00Z' },
      ],
    };

    const row = findLatestEntitlementRow(session, PACKAGE_APP);
    expect(row).toEqual({
      packageKey: PACKAGE_APP,
      expiresAt: '2027-01-01T00:00:00Z',
    });
  });

  test('findLatestEntitlementRow returns null if no matching entitlement exists', () => {
    const session = {
      entitlements: [{ packageKey: 'other', expiresAt: null }],
    };

    expect(findLatestEntitlementRow(session, PACKAGE_APP)).toBeNull();
  });
});

