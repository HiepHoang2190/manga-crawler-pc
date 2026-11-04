/**
 * Đường dẫn tới file trong thư mục public/ (sau build nằm cạnh index.html trong dist/).
 * Bắt buộc dùng thay cho "/help/..." hay "/data/..." vì Electron mở file:// — đường dẫn tuyệt đối "/" trỏ nhầm ra gốc ổ đĩa.
 * @param {string} path - ví dụ "help/overview.jpg" hoặc "data/QR.jpg"
 */
export function publicAsset(path) {
  const p = String(path).replace(/^\/+/, '');
  let base = (import.meta && import.meta.env && import.meta.env.BASE_URL) || '/';
  if (!base.endsWith('/')) {
    base += '/';
  }
  return `${base}${p}`;
}
