'use strict';

const PACKAGE_APP = 'app';

function isAdminSession(session) {
  if (session?.isAdmin === true) return true;
  return String(session?.userType || '').trim().toLowerCase() === 'admin';
}

function isEntitlementActive(row, nowMs = Date.now()) {
  if (!row) return false;
  const raw = row.expiresAt ?? row.expires_at;
  if (raw == null || raw === '') return true;
  const expiresMs = Date.parse(raw);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > nowMs;
}

function legacyEntitlementsForUserType(userType) {
  const normalized_type = String(userType || '').trim().toLowerCase();
  if (
    normalized_type === 'member' ||
    normalized_type === 'premium member' ||
    normalized_type === 'super member'
  ) {
    return [{ packageKey: PACKAGE_APP, expiresAt: null }];
  }
  return [];
}

function sessionEntitlementRows(session) {
  if (Array.isArray(session?.entitlements)) return session.entitlements;
  return legacyEntitlementsForUserType(session?.userType);
}

function hasActivePackage(session, packageKey, nowMs = Date.now()) {
  if (isAdminSession(session)) return true;
  const entitlement_rows = sessionEntitlementRows(session);
  return entitlement_rows.some((row) => {
    const entitlement_key = String(row?.packageKey || row?.package_key || '');
    return entitlement_key === packageKey && isEntitlementActive(row, nowMs);
  });
}

function hasApp(session, nowMs) {
  return hasActivePackage(session, PACKAGE_APP, nowMs);
}

function defaultExpiresAtIso(packageKey, now = new Date()) {
  if (packageKey === PACKAGE_APP) return null;
  const expiry_date = new Date(now);
  expiry_date.setFullYear(expiry_date.getFullYear() + 1);
  return expiry_date.toISOString();
}

module.exports = {
  PACKAGE_APP,
  isEntitlementActive,
  hasActivePackage,
  sessionEntitlementRows,
  hasApp,
  defaultExpiresAtIso,
};
