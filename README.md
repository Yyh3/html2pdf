# html2pdf

> Render an HTML file (local or URL) into a faithful PDF using a **real headless browser**.
> Preserves CSS gradients, shadows, custom fonts, and responsive layouts — no `@media print` surprises.

Designed for one common case: you have a nicely styled HTML report, dashboard, or travel itinerary, and you want a PDF that looks **identical** to what the user sees in a browser. Not a print-stripped PDF, not a screenshot PDF with unselectable text — a real, vector-text PDF.

## Why this exists

Most "HTML to PDF" tools do one of two things:

1. **Headless Chrome / Edge with `--print-to-pdf`** — defaults to `@media print`, strips colors and shadows, gives you a "printer-friendly" black-and-white PDF that no longer looks like your HTML.
2. **wkhtmltopdf / weasyprint** — limited CSS support, especially for modern features like `backdrop-filter`, `clamp()`, CSS variables, grid layouts, sticky elements.

`html2pdf` uses `puppeteer-core` driving Microsoft Edge with `emulateMediaType('screen')`, so the PDF keeps the same styles you'd see in a normal browser tab. Plus it auto-disables sticky elements during pagination so they don't repeat on every page.

## When to use it

- You have a styled HTML (travel plan, dashboard, report card, generated page) and want a PDF that looks like the screen version.
- The HTML uses modern CSS — gradients, shadows, custom fonts, grid/flex layouts, `@media` queries.
- You want **selectable text** in the PDF (not a flattened screenshot).

## When NOT to use it

- You want a printer-optimized black-and-white PDF → use Chrome's built-in `--print-to-pdf`.
- You want to edit the PDF afterwards → use a `pdf` skill to manipulate the output.
- The HTML is plain-text-style (no CSS, no images) → any tool works; this one is overkill.

## Requirements

- **Node.js 18+**
- A **Chromium-based browser** — auto-detected in this order:
  - `HTML2PDF_CHROME` environment variable (any platform)
  - **Windows**: Microsoft Edge (built-in on Win10/11), then Google Chrome
  - **macOS**: Google Chrome, Microsoft Edge, or Chromium in `/Applications`
  - **Linux**: `google-chrome`, `chromium`, `chromium-browser`, or `microsoft-edge`
- Override detection any time with `--chrome=/path/to/browser`.

## Install

```bash
git clone https://github.com/Yyh3/html2pdf.git
cd html2pdf
npm install
```

That's it. `puppeteer-core` is the only runtime dep — it does **not** download a Chromium copy (you already have Edge).

## Usage

### CLI

```bash
# Render a local HTML file
node scripts/render.js examples/minimal.html out.pdf

# Render a URL
node scripts/render.js https://example.com report.pdf

# Custom page size and margins
node scripts/render.js page.html out.pdf --format=A4 --margin=10mm

# JS-heavy page: wait for a selector, then an extra second
node scripts/render.js dashboard.html out.pdf --wait-selector=".chart-ready" --wait=1000

# Append your own CSS before capture (inline or @file)
node scripts/render.js page.html out.pdf --extra-css="@my-fixes.css"
```

### From your own code

```js
const { renderHtmlToPdf } = require('html2pdf');

await renderHtmlToPdf({
  input: 'examples/minimal.html',     // file path or http(s) URL
  output: 'out.pdf',
  format: 'A4',                       // 'A4' | 'Letter' | 'Legal' | { width, height }
  landscape: false,
  margin: '10mm',
  printBackground: true,
  preferCssPageSize: false,
  waitForSelector: null,              // optional: wait for a CSS selector before capturing
  extraCss: 'body { font-size: 12pt; }', // optional: CSS injected just before capture
});
```

### As an agent skill (SKILL.md)

The `skills/html-to-pdf/` subdirectory is a self-contained skill for AI agents that support the `SKILL.md` format (e.g. Kimi Work, Claude-style skill loaders). Copy or symlink it into your agent's skills directory, then run `npm install` inside it. After reload, the agent will trigger the skill on requests like "convert this HTML to PDF" / "把这份 HTML 转成 PDF" / "render this page to PDF".

## Options

| Option | Default | Notes |
|---|---|---|
| `input` | (required) | Local file path or `http(s)://` URL |
| `output` | (required) | Absolute or relative path for the PDF |
| `format` | `A4` | Page format — `A4`, `A3`, `Letter`, `Legal`, or `{width, height}` in CSS units |
| `landscape` | `false` | Rotate page |
| `margin` | `10mm` | Single value (uniform) or 4-value `top right bottom left` |
| `viewportWidth` | `794` | Logical pixels. **794 = A4 width at 96 dpi** — narrow enough to trigger `@media (max-width: 860px)` layouts, which paginate cleanly |
| `printBackground` | `true` | Required for gradients / shadows / colored cards to show |
| `emulateMedia` | `screen` | Set to `print` if you actually want a printer-stripped PDF |
| `waitForSelector` | `null` | CSS selector to wait for before capturing (JS-heavy pages). CLI: `--wait-selector` |
| `extraWaitMs` | `0` | Extra fixed delay after load, in ms. CLI: `--wait` |
| `chrome` | auto | Override browser binary path if needed |
| `extraCss` | built-in fixes | CSS injected right before capture — handy for `@page` rules, `break-inside: avoid` etc. Your CSS is appended after the built-in sticky/pagination fixes. CLI: `--extra-css` (inline or `@file`) |

## What it does to your HTML

1. Launches headless Edge (or your chosen Chromium binary).
2. Sets a 794px-wide viewport — this matches A4's logical width so layouts designed for `@media (max-width: 860px)` (single column) paginate cleanly. If your HTML was designed for a wide desktop (3-column grids), the page CSS will still kick in.
3. Calls `emulateMediaType('screen')` so `@media print` rules are **not** applied — your colors stay.
4. Injects a small CSS override that disables `position: sticky` (so nav bars and timeline labels don't repeat on every page) and adds `break-inside: avoid` to cards.
5. Renders to A4 portrait, default 10mm margin.

## Limitations

- **JavaScript-heavy pages** that need time to settle may not capture fully. Use `--wait-selector` to block on a specific element, or `--wait=<ms>` for a fixed delay.
- **External web fonts** not cached on the system will not load (no network fonts in headless). Either embed them via `<link>` to a CDN, or use system fonts.
- **CORS / mixed content** warnings may appear in console — usually harmless for capture.
- **PDF/A compliance**: not guaranteed. This produces standard PDF 1.4-ish output.

## License

MIT
