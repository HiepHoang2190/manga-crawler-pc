/**
 * Check if sharp is available and try to install if missing (Windows only)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let sharpChecked = false;
let sharpAvailable = false;

/**
 * Check if sharp module is available
 * @returns {boolean}
 */
function isSharpAvailable() {
  if (sharpChecked) return sharpAvailable;
  
  try {
    const sharp = require('sharp');
    if (typeof sharp.cache === 'function') {
      sharp.cache(false);
    }
    sharpAvailable = true;
    sharpChecked = true;
    return true;
  } catch (e) {
    sharpAvailable = false;
    sharpChecked = true;
    return false;
  }
}

/**
 * Try to install sharp for Windows (one-time auto-fix)
 * Only runs on Windows when sharp is missing
 */
async function tryInstallSharpForWindows() {
  // Only on Windows
  if (process.platform !== 'win32') return false;
  
  // Already available
  if (isSharpAvailable()) return true;
  
  // Check if we already tried (don't retry every time)
  const flagFile = path.join(require('electron').app.getPath('userData'), '.sharp-install-attempted');
  if (fs.existsSync(flagFile)) {
    console.log('[Sharp] Already attempted install, skipping');
    return false;
  }
  
  console.log('[Sharp] Not found on Windows, attempting auto-install...');
  
  try {
    // Mark as attempted
    fs.writeFileSync(flagFile, new Date().toISOString());
    
    // Get app root (where package.json is)
    const appRoot = path.join(__dirname, '../../..');
    
    // Try to install sharp
    console.log('[Sharp] Running: npm install --force sharp');
    execSync('npm install --force sharp', {
      cwd: appRoot,
      stdio: 'inherit',
      timeout: 120000 // 2 minutes
    });
    
    console.log('[Sharp] Install completed, checking availability...');
    
    // Clear require cache and check again
    delete require.cache[require.resolve('sharp')];
    sharpChecked = false;
    
    if (isSharpAvailable()) {
      console.log('[Sharp] Successfully installed and loaded');
      return true;
    } else {
      console.log('[Sharp] Install completed but module still not available');
      return false;
    }
  } catch (e) {
    console.error('[Sharp] Auto-install failed:', e.message);
    return false;
  }
}

/**
 * Get sharp module or null if not available
 * @returns {object|null}
 */
function getSharp() {
  if (!isSharpAvailable()) return null;
  try {
    const s = require('sharp');
    if (typeof s.cache === 'function') {
      s.cache(false);
    }
    return s;
  } catch {
    return null;
  }
}

module.exports = {
  isSharpAvailable,
  tryInstallSharpForWindows,
  getSharp
};
