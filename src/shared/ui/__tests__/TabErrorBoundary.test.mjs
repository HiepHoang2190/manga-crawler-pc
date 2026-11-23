import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as babel from '@babel/core';
import presetReact from '@babel/preset-react';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const boundaryPath = path.resolve(dirname, '../TabErrorBoundary.jsx');
const src = fs.readFileSync(boundaryPath, 'utf8');

function loadTabErrorBoundaryClass() {
  const transformed = babel.transformSync(src, {
    filename: boundaryPath,
    presets: [[presetReact, { runtime: 'classic' }]],
    plugins: [],
    sourceType: 'module',
  });
  const cjsCode = transformed.code
    .replace(/import React,\s*\{\s*Component\s*\}\s*from\s*'react';/, "const React = require('react'); const { Component } = React;")
    .replace(/export default class TabErrorBoundary/, 'class TabErrorBoundary');
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', `${cjsCode}\nmodule.exports = TabErrorBoundary;`);
  fn(require, mod, mod.exports);
  return mod.exports;
}

describe('TabErrorBoundary', () => {
  const TabErrorBoundary = loadTabErrorBoundaryClass();

  test('getDerivedStateFromError captures error and sets hasError', () => {
    const err = new Error('Boom in studio');
    expect(TabErrorBoundary.getDerivedStateFromError(err)).toEqual({ hasError: true, error: err });
  });

  test('handleRetry resets error state', () => {
    const instance = new TabErrorBoundary({ tabId: 'workflow', t: (k) => k });
    instance.state = { hasError: true, error: new Error('fail') };
    let captured = null;
    instance.setState = (updater) => {
      captured = updater;
    };
    instance.handleRetry();
    expect(captured).toEqual({ hasError: false, error: null });
  });

  test('componentDidUpdate resets error when tabId changes', () => {
    const instance = new TabErrorBoundary({ tabId: 'toolsStudio', t: (k) => k });
    instance.state = { hasError: true, error: new Error('fail') };
    let captured = null;
    instance.setState = (updater) => {
      captured = updater;
    };
    instance.componentDidUpdate({ tabId: 'workflow' });
    expect(captured).toEqual({ hasError: false, error: null });
  });

  test('uses theme CSS tokens instead of hardcoded dark hex colors and obeys UI standards', () => {
    expect(src).not.toMatch(/#0e0e0e|#161616/i);
    expect(src).toMatch(/bg-surface-container-high/);
    expect(src).toMatch(/border-error\/30/);
    expect(src).not.toMatch(/\bunderline\b/);
    expect(src).not.toMatch(/\btitle=/);
  });
});
