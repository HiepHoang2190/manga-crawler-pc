#!/usr/bin/env node
/**
 * Ensure Windows native modules are present before electron-builder --win.
 *
 * Cross-builds from macOS skip packages with "os":["win32"] unless force-installed.
 * Without @img/sharp-win32-x64, packaged Windows apps crash when sharp loads.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const installPackages = [
  '@img/sharp-win32-x64@0.34.5',
  '@img/sharp-libvips-win32-x64@1.2.4',
  '@napi-rs/canvas-win32-x64-msvc@1.0.0',
];

const requiredRelativePaths = [
  'node_modules/@img/sharp-win32-x64/package.json',
  'node_modules/@img/sharp-libvips-win32-x64/package.json',
  'node_modules/@napi-rs/canvas-win32-x64-msvc/package.json',
];

function pathExists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function allRequiredPresent() {
  return requiredRelativePaths.every(pathExists);
}

function installWindowsNativeModules() {
  const installCommand = [
    'npm',
    'install',
    '--force',
    '--ignore-scripts',
    ...installPackages,
  ].join(' ');
  console.log(`[ensure-win-native] ${installCommand}`);
  execSync(installCommand, { cwd: projectRoot, stdio: 'inherit' });
}

function assertRequiredPresent() {
  const missingPaths = requiredRelativePaths.filter((relativePath) => !pathExists(relativePath));
  if (missingPaths.length === 0) {
    console.log('[ensure-win-native] All Windows native modules are present.');
    return;
  }
  console.error('[ensure-win-native] Missing required Windows native modules:');
  for (const missingPath of missingPaths) {
    console.error(`  - ${missingPath}`);
  }
  console.error(
    '[ensure-win-native] Windows builds will crash (sharp win32-x64). Aborting.'
  );
  process.exit(1);
}

function ensureWindowsUpscaleBinaries() {
  const winUpscaleExe = path.join(projectRoot, 'resources', 'upscale', 'win-x64', 'waifu2x-ncnn-vulkan.exe');
  if (fs.existsSync(winUpscaleExe)) {
    console.log('[ensure-win-native] Windows upscale binaries are present.');
    return;
  }
  console.log('[ensure-win-native] Windows upscale binaries missing. Downloading...');
  const scriptPath = path.join(__dirname, 'downloadUpscaleBinaries.js');
  execSync(`node "${scriptPath}" --platform win-x64`, { cwd: projectRoot, stdio: 'inherit' });
}

if (allRequiredPresent()) {
  console.log('[ensure-win-native] Packages already on disk; re-force install to pin versions.');
}
installWindowsNativeModules();
ensureWindowsUpscaleBinaries();
assertRequiredPresent();

