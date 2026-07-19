#!/usr/bin/env node
/**
 * check-env — verify the host can actually run html2pdf.
 *
 * Checks:
 *   1. Node.js version >= 18
 *   2. A Chromium-based browser is reachable (Microsoft Edge on Windows by default)
 *   3. puppeteer-core is installed in the local node_modules
 *
 * Exit code: 0 = all good, 1 = at least one issue.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { findEdge } = require('./render');

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
  const edge = findEdge();
  if (edge) ok(`Browser found: ${edge}`);
  else {
    bad('No Chromium-based browser found.');
    info('On Windows, install Microsoft Edge (built-in on Win10/11).');
    info('On macOS / Linux, set HTML2PDF_CHROME=/path/to/chrome or pass { chrome: ... }');
  }
}

function checkPuppeteer() {
  try {
    const pkg = require(path.join(process.cwd(), 'node_modules', 'puppeteer-core', 'package.json'));
    ok(`puppeteer-core ${pkg.version} installed`);
  } catch (_) {
    bad('puppeteer-core is not installed.');
    info('Run: npm install puppeteer-core');
  }
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
