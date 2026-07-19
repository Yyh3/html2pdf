#!/usr/bin/env node
/**
 * check-env — verify the host can actually run html2pdf.
 *
 * Checks:
 *   1. Node.js version >= 18
 *   2. A Chromium-based browser is reachable (auto-detected per platform)
 *   3. puppeteer-core is installed (next to this script, or in the cwd)
 *
 * Exit code: 0 = all good, 1 = at least one issue.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { findBrowser } = require('./render');

let problems = 0;

function ok(msg) { console.log('  ✓ ' + msg); }
function bad(msg) { console.log('  ✗ ' + msg); problems++; }
function info(msg) { console.log('    ' + msg); }

function checkNode() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major >= 18) ok(`Node.js ${process.versions.node} (>= 18)`);
  else bad(`Node.js ${process.versions.node} — html2pdf requires Node 18+.`);
}

function checkBrowser() {
  const found = findBrowser();
  if (found) ok(`Browser found: ${found}`);
  else {
    bad('No Chromium-based browser found.');
    info('Windows: install Microsoft Edge (built-in on Win10/11) or Google Chrome.');
    info('macOS:   install Google Chrome / Microsoft Edge / Chromium.');
    info('Linux:   install google-chrome or chromium via your package manager.');
    info('Or set HTML2PDF_CHROME=/path/to/browser to point at a binary directly.');
  }
}

function checkPuppeteer() {
  // Look next to this script first (scripts/ -> package root), then the cwd,
  // so the check works no matter where it is invoked from.
  const roots = [path.join(__dirname, '..'), process.cwd()];
  for (const root of roots) {
    try {
      const pkg = require(path.join(root, 'node_modules', 'puppeteer-core', 'package.json'));
      ok(`puppeteer-core ${pkg.version} installed (${path.join(root, 'node_modules')})`);
      return;
    } catch (_) { /* keep looking */ }
  }
  bad('puppeteer-core is not installed.');
  info(`Run: cd "${path.join(__dirname, '..')}" && npm install`);
}

console.log('html2pdf environment check');
console.log('--------------------------');
checkNode();
checkBrowser();
checkPuppeteer();
console.log('--------------------------');
if (problems === 0) {
  console.log('All checks passed. You can render PDFs.');
  process.exit(0);
} else {
  console.log(`${problems} issue(s) found. Fix them and re-run.`);
  process.exit(1);
}
