export const PACKAGE_APP = 'app';

function normalizeEntitlementRow(raw_row) {
  const package_key = String(raw_row?.packageKey || raw_row?.package_key || '').trim();
  if (!package_key) return null;
  const raw_expires_at = raw_row?.expiresAt ?? raw_row?.expires_at ?? null;
  return {
    packageKey: package_key,
    expiresAt: raw_expires_at == null || raw_expires_at === '' ? null : String(raw_expires_at),
  };
}

export function buildSessionAccessSnapshot(session) {
  const entitlement_rows = Array.isArray(session?.entitlements) ? session.entitlements : [];
  return {
    userType: String(session?.userType || '').trim(),
    isAdmin: session?.isAdmin === true,
    entitlements: entitlement_rows
      .map((raw_row) => normalizeEntitlementRow(raw_row))
      .filter(Boolean),
  };
}

export function findLatestEntitlementRow(session, package_key) {
  const entitlement_rows = Array.isArray(session?.entitlements) ? session.entitlements : [];
  return (
    entitlement_rows
      .map((raw_row) => normalizeEntitlementRow(raw_row))
      .filter((normalized_row) => normalized_row?.packageKey === package_key)
      .sort((left_row, right_row) => {
        const left_time = Date.parse(left_row?.expiresAt ?? '') || 0;
        const right_time = Date.parse(right_row?.expiresAt ?? '') || 0;
        return right_time - left_time;
      })[0] || null
  );
}

