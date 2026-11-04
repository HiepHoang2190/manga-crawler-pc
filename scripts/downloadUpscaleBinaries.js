#!/usr/bin/env node
/**
 * Download NCNN-Vulkan upscale binaries from GitHub releases.
 *
 * Usage:
 *   node scripts/downloadUpscaleBinaries.js              # Download for current platform
 *   node scripts/downloadUpscaleBinaries.js --all        # Download for all platforms
 *   node scripts/downloadUpscaleBinaries.js --platform win-x64
 *   node scripts/downloadUpscaleBinaries.js --platform win-x64 --force
 *
 * Downloads pre-built binaries, DLLs, and bundled models for:
 *   - waifu2x-ncnn-vulkan   (nihui)
 *   - realesrgan-ncnn-vulkan (xinntao)
 *   - realcugan-ncnn-vulkan  (nihui)
 *
 * Extracted to: resources/upscale/{platform}/
 */

const path = require('path');
const { ENGINES, getPlatformDir, downloadEngine } = require('../electron/lib/upscale/BinaryDownloader');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'upscale');

async function main() {
  const args = process.argv.slice(2);
  let platforms;

  if (args.includes('--all')) {
    platforms = ['win-x64', 'mac-x64', 'mac-arm64'];
  } else if (args.includes('--platform')) {
    const idx = args.indexOf('--platform');
    platforms = [args[idx + 1]];
  } else {
    platforms = [getPlatformDir()];
  }

  const force = args.includes('--force');
  let engineFilter = null;
  if (args.includes('--engine')) {
    const idx = args.indexOf('--engine');
    engineFilter = args[idx + 1];
  }

  console.log(`Downloading NCNN-Vulkan binaries for: ${platforms.join(', ')}`);
  console.log(`Target directory: ${RESOURCES_DIR}\n`);

  const enginesToDownload = engineFilter ? ENGINES.filter((e) => e.id === engineFilter) : ENGINES;

  for (const platform of platforms) {
    console.log(`\n=== Platform: ${platform} ===`);
    for (const engine of enginesToDownload) {
      const res = await downloadEngine(engine.id, {
        platform,
        destRoot: RESOURCES_DIR,
        force,
        onLog: (msg) => console.log(`  ${msg}`),
      });
      if (!res.ok) {
        console.error(`  ✗ Failed to download ${engine.id}: ${res.error}`);
      }
    }
  }

  console.log('\n✓ Upscale binaries check completed!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
