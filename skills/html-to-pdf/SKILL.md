---
name: html-to-pdf
description: |
  Render an HTML file (local or URL) into a faithful PDF using a real headless browser.
  Use when the user asks to "convert this HTML to PDF" / "把这份 HTML 转成 PDF" / "turn
  this report into a PDF" / "render this page to PDF" / "save as PDF" and the source is
  a styled HTML document, dashboard, generated report, or local webpage. Preserves CSS
  gradients, shadows, custom fonts, and responsive layouts (not a print-stripped PDF).
  Do NOT use for: editing/reading existing PDFs (use the `pdf` skill), DOCX→PDF, or
  PPTX→PDF conversions.
---

# html-to-pdf

## Inputs to collect

- **Source HTML**: local file path or `http(s)://` URL. If the user pastes a path or URL, use it. If they describe content ("the report I just made"), locate the most recent HTML in the working directory.
- **Output path**: where to write the PDF. If not given, default to `<input-stem>.pdf` next to the input, or the user's current workspace root.
- **Page size** (rare): only ask if the user explicitly says "A4" / "Letter" / "横向" / "landscape" — otherwise default to A4 portrait.
- **Style mode** (very rare): only ask if the user says "黑白" / "printer-friendly" / "print version" — otherwise keep screen styles (gradients/shadows/colors).

Do not ask about viewport, browser path, or dependencies — the script handles those automatically.

## Procedure

1. **Locate or install the toolchain.** Run `node <skill-dir>/scripts/check-env.js`. If it reports any ✗:
   - Missing `puppeteer-core` → `cd <skill-dir> && npm install puppeteer-core`. Wait, then re-check.
   - Missing browser → tell the user Edge is needed; on Win10/11 it ships by default. On macOS/Linux, ask the user for the Chrome/Chromium path and set `HTML2PDF_CHROME` env var, or pass `{ chrome: "/path" }` to the script.
   - Node < 18 → tell the user; html2pdf needs Node 18+.

2. **Run the render.** Use the bundled script — do not reinvent the wrapper.

   ```bash
   node <skill-dir>/scripts/render.js "<input>" "<output>.pdf" [options]
   ```

   Common flags:
   - `--format=A4` (default) / `A3` / `A5` / `Letter` / `Legal`
   - `--landscape`
   - `--margin=10mm` or `10mm 8mm 12mm 8mm`
   - `--print` to use `@media print` styles (drops colors); omit to keep screen styles
   - `--wait=1500` if the page is JS-heavy and 1s networkidle isn't enough

   From code instead:
   ```js
   const { renderHtmlToPdf } = require('<skill-dir>/scripts/render');
   await renderHtmlToPdf({ input, output, ... });
   ```

3. **Verify the output.** Open the PDF (or use `Read` with `pages: "1-2"` to spot-check). Check that:
   - Hero / gradient / brand colors survived (not stripped to greyscale)
   - All sections present
   - No text overflowing the right margin

4. **Report back to the user** with the file path and page count. Mention any visible issues (e.g. "page 3 has a leftover empty section — probably the source HTML").

## Output contract

- One PDF file at the requested output path.
- File is a standard PDF (vector text, selectable / copyable), not a flattened screenshot.
- 794px-wide viewport, A4 portrait by default, 10mm margin all sides.
- Page count = however many A4 pages the HTML fills.
- The result is delivered to the user via `<deliver-assets>` as a `type="file"` media tag, never just the path.

## Failure handling

- **`Input file not found`** — re-check the path; the user may have given a relative path that doesn't resolve from the current working directory.
- **`No Chromium-based browser found`** — on Windows, check `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. If missing, tell the user to install Edge or Chrome and re-run.
- **`puppeteer-core is not installed`** — run `npm install puppeteer-core` in the skill directory. Don't try to use `puppeteer` (full) — that downloads a 200MB Chromium and is overkill when Edge already exists.
- **PDF comes out blank or mostly white** — usually the HTML depends on JS that didn't finish loading. Add `--wait=2000` and re-run. If the page fetches data, open the source HTML and confirm it works in a normal browser first.
- **Sticky elements repeat on every page** — already disabled by the bundled `extraCss`. If a custom sticky still repeats, add `--extra-css=` to override (only via the JS API; CLI doesn't expose this yet).
- **Chinese / CJK characters look like tofu boxes** — the headless browser can't load web fonts. Either embed the font in the HTML, or use system fonts (the bundled example already uses `"Segoe UI", "Microsoft YaHei", "PingFang SC"`).
- **Page break inside a card** — already handled by the default `extraCss`. If a custom card still splits, the user can override `--extra-css` via the JS API.

## Examples

**Input:** "把 `C:\reports\q3.html` 转成 PDF"
**Action:** locate input → `node scripts/render.js "C:\reports\q3.html" "C:\reports\q3.pdf"` → deliver via `<deliver-assets>`.
**Output:** 8-page PDF with full styling preserved.

**Input:** "Render https://example.com to PDF"
**Action:** `node scripts/render.js https://example.com out.pdf` (URL detected automatically).
**Output:** PDF, no manual file:// conversion needed.

**Input:** "把这份报告做成 A3 横向 PDF"
**Action:** add `--format=A3 --landscape` to the render command.
**Output:** A3 landscape PDF.

## Windows (win32) platform notes

- The script auto-detects Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (default on Win10/11) and `C:\Program Files\Microsoft\Edge\Application\msedge.exe`.
- If you have Chrome instead, set `HTML2PDF_CHROME=C:\path\to\chrome.exe` before running, or pass `--chrome="C:\path\to\chrome.exe"`.
- PowerShell users: pass args with quotes (`node render.js "input.html" "out.pdf"`). Do not chain with `&&` — use `;` or `if ($?) { ... }`.
- For Chinese / Japanese / Korean content, the system fonts Segoe UI / Microsoft YaHei / MS Gothic are embedded by Windows — no extra font setup needed.
