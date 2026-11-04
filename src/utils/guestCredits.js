/** @typedef {{ remaining: number, fingerprint: string }} GuestCreditState */

export const GUEST_CREDITS_KEY = 'guest_credits_remaining';
export const GUEST_FINGERPRINT_KEY = 'guest_fingerprint';
export const GUEST_CREDIT_MAX = 100;

function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Khởi tạo fingerprint và credit mặc định (100) lần đầu mở app.
 */
export function ensureGuestStorageInitialized() {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem(GUEST_FINGERPRINT_KEY)) {
      localStorage.setItem(GUEST_FINGERPRINT_KEY, randomUuid());
    }
    const raw = localStorage.getItem(GUEST_CREDITS_KEY);
    if (raw === null || raw === '') {
      localStorage.setItem(GUEST_CREDITS_KEY, String(GUEST_CREDIT_MAX));
    }
  } catch {
    /* ignore */
  }
}

export function getGuestFingerprint() {
  if (typeof window === 'undefined') return '';
  try {
    let fp = localStorage.getItem(GUEST_FINGERPRINT_KEY);
    if (!fp) {
      fp = randomUuid();
      localStorage.setItem(GUEST_FINGERPRINT_KEY, fp);
    }
    return fp;
  } catch {
    return '';
  }
}

export function getGuestCreditsRemaining() {
  if (typeof window === 'undefined') return GUEST_CREDIT_MAX;
  try {
    ensureGuestStorageInitialized();
    const n = Number(localStorage.getItem(GUEST_CREDITS_KEY));
    if (!Number.isFinite(n)) return GUEST_CREDIT_MAX;
    return Math.max(0, Math.min(GUEST_CREDIT_MAX, Math.floor(n)));
  } catch {
    return GUEST_CREDIT_MAX;
  }
}

export function setGuestCreditsRemaining(n) {
  if (typeof window === 'undefined') return;
  try {
    const v = Math.max(0, Math.min(GUEST_CREDIT_MAX, Math.floor(Number(n) || 0)));
    localStorage.setItem(GUEST_CREDITS_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** Trừ 1 credit (trước khi tải). Trả về false nếu đã hết. */
export function consumeGuestCredit() {
  const cur = getGuestCreditsRemaining();
  if (cur <= 0) return false;
  setGuestCreditsRemaining(cur - 1);
  return true;
}

/** Hoàn 1 credit (khi tải thất bại / bỏ qua), không vượt trần. */
export function refundGuestCredit() {
  const cur = getGuestCreditsRemaining();
  if (cur >= GUEST_CREDIT_MAX) return;
  setGuestCreditsRemaining(cur + 1);
}
