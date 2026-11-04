#!/usr/bin/env node
/**
 * Ensure macOS Intel (darwin-x64) native modules are present before building for Mac.
 *
 * Building on Apple Silicon (arm64) by default only installs darwin-arm64 native packages.
 * Without darwin-x64 modules (@img/sharp-darwin-x64, @napi-rs/canvas-darwin-x64, onnxruntime-node darwin/x64),
 * packaged Mac x64 apps will crash on Intel Macs when loading native modules.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const installPackages = [
  '@img/sharp-darwin-x64@0.34.5',
  '@img/sharp-libvips-darwin-x64@1.2.4',
  '@napi-rs/canvas-darwin-x64@1.0.0',
];

const requiredRelativePaths = [
  'node_modules/@img/sharp-darwin-x64/package.json',
  'node_modules/@img/sharp-libvips-darwin-x64/package.json',
  'node_modules/@napi-rs/canvas-darwin-x64/package.json',
];

function pathExists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function allRequiredPresent() {
  return requiredRelativePaths.every(pathExists);
}

function installMacX64NativeModules() {
  const installCommand = [
    'npm',
    'install',
    '--force',
    '--ignore-scripts',
    ...installPackages,
  ].join(' ');
  console.log(`[ensure-mac-native] Installing Mac x64 native packages: ${installCommand}`);
  execSync(installCommand, { cwd: projectRoot, stdio: 'inherit' });
}

function ensureOnnxRuntimeDarwinX64() {
  const onnxDarwinX64Dir = path.join(
    projectRoot,
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v6',
    'darwin',
    'x64'
  );
  const bindingPath = path.join(onnxDarwinX64Dir, 'onnxruntime_binding.node');
  const dylibPath = path.join(onnxDarwinX64Dir, 'libonnxruntime.1.23.2.dylib');

  if (fs.existsSync(bindingPath) && fs.existsSync(dylibPath)) {
    console.log('[ensure-mac-native] onnxruntime-node darwin/x64 binaries already present.');
    return;
  }

  console.log('[ensure-mac-native] Downloading onnxruntime-node darwin/x64 prebuilts (v1.23.2)...');
  fs.mkdirSync(onnxDarwinX64Dir, { recursive: true });

  const tempTar = path.join(projectRoot, 'node_modules', '.onnxruntime-node-1.23.2.tgz');
  const extractDir = path.join(projectRoot, 'node_modules', '.onnxruntime-temp');

  try {
    execSync(
      `curl -sL https://registry.npmjs.org/onnxruntime-node/-/onnxruntime-node-1.23.2.tgz -o "${tempTar}"`,
      { stdio: 'inherit' }
    );
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar -zxf "${tempTar}" -C "${extractDir}"`, { stdio: 'inherit' });

    const sourceBinDir = path.join(extractDir, 'package', 'bin', 'napi-v6', 'darwin', 'x64');
    if (fs.existsSync(sourceBinDir)) {
      const files = fs.readdirSync(sourceBinDir);
      for (const file of files) {
        fs.copyFileSync(path.join(sourceBinDir, file), path.join(onnxDarwinX64Dir, file));
      }
      const symlinkPath = path.join(onnxDarwinX64Dir, 'libonnxruntime.1.dylib');
      if (!fs.existsSync(symlinkPath)) {
        try {
          fs.symlinkSync('libonnxruntime.1.23.2.dylib', symlinkPath);
        } catch (_) {}
      }
      console.log('[ensure-mac-native] onnxruntime-node darwin/x64 binaries successfully installed.');
    } else {
      throw new Error(`Directory ${sourceBinDir} not found in tarball.`);
    }
  } catch (err) {
    console.error('[ensure-mac-native] Failed to download/extract onnxruntime-node darwin/x64:', err.message);
  } finally {
    try {
      if (fs.existsSync(tempTar)) fs.unlinkSync(tempTar);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function assertRequiredPresent() {
  const missingPaths = requiredRelativePaths.filter((relativePath) => !pathExists(relativePath));
  if (missingPaths.length === 0) {
    console.log('[ensure-mac-native] All Mac x64 native modules are present.');
    return;
  }
  console.error('[ensure-mac-native] Missing required Mac x64 native modules:');
  for (const missingPath of missingPaths) {
    console.error(`  - ${missingPath}`);
  }
  console.error('[ensure-mac-native] Mac Intel (x64) builds will crash without these modules. Aborting.');
  process.exit(1);
}

function ensureMacUpscaleBinaries() {
  const macArm64 = path.join(projectRoot, 'resources', 'upscale', 'mac-arm64', 'waifu2x-ncnn-vulkan');
  const macX64 = path.join(projectRoot, 'resources', 'upscale', 'mac-x64', 'waifu2x-ncnn-vulkan');
  const scriptPath = path.join(__dirname, 'downloadUpscaleBinaries.js');
  if (!fs.existsSync(macArm64)) {
    console.log('[ensure-mac-native] Downloading Mac arm64 upscale binaries...');
    execSync(`node "${scriptPath}" --platform mac-arm64`, { cwd: projectRoot, stdio: 'inherit' });
  }
  if (!fs.existsSync(macX64)) {
    console.log('[ensure-mac-native] Downloading Mac x64 upscale binaries...');
    execSync(`node "${scriptPath}" --platform mac-x64`, { cwd: projectRoot, stdio: 'inherit' });
  }
}

if (!allRequiredPresent()) {
  installMacX64NativeModules();
} else {
  console.log('[ensure-mac-native] Mac x64 npm packages already on disk.');
}
ensureOnnxRuntimeDarwinX64();
ensureMacUpscaleBinaries();
assertRequiredPresent();
