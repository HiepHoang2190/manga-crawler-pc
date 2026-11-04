const path = require('path');

function foldsCaseOnPlatform(platform_value = process.platform) {
  // Windows NTFS and typical macOS APFS volumes are case-insensitive.
  return platform_value === 'win32' || platform_value === 'darwin';
}

function normalizeKey(text_value) {
  const raw = String(text_value ?? '');
  const nfc = raw.normalize('NFC');
  if (foldsCaseOnPlatform()) return nfc.toLowerCase();
  return nfc;
}

/** NFC-only string compare — detects display/case changes even when the FS folds case. */
function displayNamesDiffer(left_name, right_name) {
  return String(left_name ?? '').normalize('NFC') !== String(right_name ?? '').normalize('NFC');
}

function namesEqual(left_name, right_name) {
  return normalizeKey(left_name) === normalizeKey(right_name);
}

function pathsEqual(left_path, right_path) {
  return normalizeKey(path.normalize(left_path)) === normalizeKey(path.normalize(right_path));
}

module.exports = {
  namesEqual,
  pathsEqual,
  normalizeKey,
  displayNamesDiffer,
  foldsCaseOnPlatform,
};
