#!/usr/bin/env node
/**
 * html2pdf — render an HTML file (local or URL) into a faithful PDF.
 *
 * Uses puppeteer-core driving a Chromium-based browser (Microsoft Edge on
 * Windows by default) in headless mode, with emulateMediaType('screen') so
 * the PDF keeps CSS gradients, shadows, and other styles that browsers show
 * on screen but `@media print` strips.
 *
 * CLI:
 *   node scripts/render.js <input> <output> [options]
 *
 * Module:
 *   const { renderHtmlToPdf } = require('./scripts/render');
 *   await renderHtmlToPdf({ input, output, ... });
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BROWSER_CANDIDATES = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : null,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ],
};

/**
 * Locate a Chromium-based browser binary.
 * Priority: HTML2PDF_CHROME env var → per-platform well-known paths.
 * Returns an absolute path, or null when nothing is found.
 */
function findBrowser() {
  const candidates = [
    process.env.HTML2PDF_CHROME,
    ...(BROWSER_CANDIDATES[process.platform] || []),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) { /* ignore */ }
  }
  return null;
}

// Backwards-compatible alias (v1.0 exported findEdge).
const findEdge = findBrowser;

const PDF_DEFAULTS = {
  format: 'A4',
  landscape: false,
  margin: '10mm',
  printBackground: true,
  preferCssPageSize: false,
  viewportWidth: 794,        // A4 width at 96 dpi
  viewportHeight: 1123,      // A4 height at 96 dpi
  deviceScaleFactor: 2,      // 2x for crisp output
  emulateMedia: 'screen',
  waitForNetworkIdle: true,
  waitForSelector: null,     // optional CSS selector to await before capture
  extraWaitMs: 0,
  chrome: null,
  // CSS injected just before capture. Disable sticky so nav bars don't
  // repeat on every page; add break-inside hints to keep cards together.
  extraCss: `
    .quick-nav { position: static !important; backdrop-filter: none !important; }
    .day-label { position: static !important; }
    section { scroll-margin-top: 0 !important; }
    .card, .timeline-item, .weather-card, .evidence-card, .source-row {
      break-inside: avoid; page-break-inside: avoid;
    }
  `,
};

function toFileUrl(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    throw new Error(`Input file not found: ${abs}`);
  }
  // Use forward slashes for cross-platform file:// URLs
  return 'file:///' + abs.replace(/\\/g, '/').replace(/^\/+/, '');
}

function parseMargin(m) {
  if (typeof m !== 'string') return m;
  const parts = m.trim().split(/\s+/);
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
  if (parts.length === 4) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  throw new Error(`Invalid margin "${m}". Use one value (e.g. "10mm") or four (e.g. "10mm 8mm 12mm 8mm").`);
}

function isUrl(s) { return /^https?:\/\//i.test(s); }

/**
 * Resolve an --extra-css spec: inline CSS text, or "@path/to/file.css" to
 * read the CSS from a file. Returns null when no spec is given.
 */
function loadExtraCss(spec) {
  if (!spec) return null;
  if (spec.startsWith('@')) {
    const p = path.resolve(spec.slice(1));
    if (!fs.existsSync(p)) {
      throw new Error(`extra-css file not found: ${p}`);
    }
    return fs.readFileSync(p, 'utf8');
  }
  return spec;
}

async function renderHtmlToPdf(opts) {
  const cfg = { ...PDF_DEFAULTS, ...opts };
  if (!cfg.input) throw new Error('`input` is required (file path or http(s) URL).');
  if (!cfg.output) throw new Error('`output` is required (path for the PDF).');

  // Resolve Chrome / Edge binary
  cfg.chrome = cfg.chrome || findBrowser();
  if (!cfg.chrome) {
    throw new Error(
      'No Chromium-based browser found.\n' +
      'On Windows, install Microsoft Edge (default on Win10/11) or Google Chrome.\n' +
      'On macOS / Linux, install Chrome/Chromium, set HTML2PDF_CHROME to the binary path,\n' +
      'or pass { chrome: "/path/to/chrome" } explicitly.'
    );
  }

  // Resolve input to a navigable URL
  const inputUrl = isUrl(cfg.input) ? cfg.input : toFileUrl(cfg.input);

  // puppeteer-core is a runtime dep — only require it when we actually render
  // (so `node scripts/check-env.js` and the CLI's --help work without it).
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    throw new Error(
      'puppeteer-core is not installed.\n' +
      'Run `npm install` (or `npm install puppeteer-core`) in the html2pdf directory, then retry.'
    );
  }

  const margin = typeof cfg.margin === 'string' ? parseMargin(cfg.margin) : cfg.margin;

  const browser = await puppeteer.launch({
    executablePath: cfg.chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: cfg.viewportWidth,
      height: cfg.viewportHeight,
      deviceScaleFactor: cfg.deviceScaleFactor,
    });
    await page.emulateMediaType(cfg.emulateMedia);

    const gotoOpts = { waitUntil: cfg.waitForNetworkIdle ? 'networkidle0' : 'domcontentloaded', timeout: 60000 };
    await page.goto(inputUrl, gotoOpts);

    if (cfg.waitForSelector) {
      await page.waitForSelector(cfg.waitForSelector, { timeout: 30000 });
    }

    // Built-in pagination fixes always apply; user CSS is appended after so
    // it can override them when needed.
    const css = [PDF_DEFAULTS.extraCss, cfg.extraCss !== PDF_DEFAULTS.extraCss ? cfg.extraCss : null]
      .filter(Boolean)
      .join('\n');
    if (css.trim()) {
      await page.addStyleTag({ content: css });
    }

    if (cfg.extraWaitMs > 0) {
      await new Promise(r => setTimeout(r, cfg.extraWaitMs));
    }

    const absOut = path.resolve(cfg.output);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });

    const pdfOpts = {
      path: absOut,
      printBackground: cfg.printBackground,
      preferCSSPageSize: cfg.preferCssPageSize,
      format: cfg.format,
      landscape: cfg.landscape,
      margin,
    };
    await page.pdf(pdfOpts);
    return absOut;
  } finally {
    await browser.close();
  }
}

// ---------- CLI ----------

function printHelp() {
  const help = `
html2pdf — render an HTML file (local or URL) into a PDF.

Usage:
  node scripts/render.js <input> <output> [options]

Arguments:
  <input>     Local HTML path or http(s):// URL
  <output>    PDF output path (will be created; parent dirs auto-made)

Options:
  --format=<name>        Page format: A3 | A4 | A5 | Letter | Legal (default: A4)
  --landscape            Use landscape orientation
  --margin=<spec>        Single value ("10mm") or four ("10mm 8mm 12mm 8mm"). Default: 10mm
  --viewport=<px>        Override CSS viewport width (default: 794 = A4 width @ 96dpi)
  --chrome=<path>        Override browser binary (default: auto-detect Edge/Chrome)
  --print                Use print media (strip colors, default printer style) instead of screen
  --wait=<ms>            Extra wait in ms after page load (useful for JS-heavy pages)
  --wait-selector=<css>  Wait until this CSS selector appears before capturing
  --extra-css=<css|@f>   Extra CSS appended before capture; "@file.css" reads from a file
  --help, -h             Show this help

Examples:
  node scripts/render.js report.html report.pdf
  node scripts/render.js https://example.com out.pdf
  node scripts/render.js page.html out.pdf --format=Letter --margin=12mm
  node scripts/render.js app.html out.pdf --wait-selector=".chart-loaded" --wait=1000
`;
  console.log(help.trim());
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq < 0) flags[a.slice(2)] = true;
      else flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    printHelp();
    process.exitCode = 2;
    return;
  }
  const [input, output] = positional;
  try {
    const out = await renderHtmlToPdf({
      input,
      output,
      format: flags.format || PDF_DEFAULTS.format,
      landscape: !!flags.landscape,
      margin: flags.margin || PDF_DEFAULTS.margin,
      viewportWidth: flags.viewport ? parseInt(flags.viewport, 10) : PDF_DEFAULTS.viewportWidth,
      chrome: flags.chrome || null,
      emulateMedia: flags.print ? 'print' : 'screen',
      waitForSelector: flags['wait-selector'] || null,
      extraWaitMs: flags.wait ? parseInt(flags.wait, 10) : 0,
      extraCss: loadExtraCss(flags['extra-css']) || PDF_DEFAULTS.extraCss,
    });
    console.log('OK', out);
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { renderHtmlToPdf, findBrowser, findEdge, PDF_DEFAULTS };
