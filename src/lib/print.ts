/**
 * Printing / PDF export helpers.
 *
 * Two delivery paths, chosen at runtime:
 *
 *  - Normal browser (laptop/desktop): render into a hidden <iframe> and open the
 *    browser's print dialog, where the user picks paper size / orientation and
 *    can "Save as PDF".
 *
 *  - Installed PWA on iOS (Home-Screen / standalone): iOS disables JS printing
 *    entirely there — window.print() (even inside an iframe) does nothing, and
 *    window.open is blocked. The only way to reach Print / "Save to Files" is to
 *    hand iOS a real PDF file through the Web Share sheet. So we render the
 *    content to a PDF and share it. The sheet slides up over the app and returns
 *    the user to it.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PRINT_CSS = `
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #1a2430; margin: 0; padding: 24px; font-size: 12.5px; }
  h1, h2, h3 { font-family: 'Spectral', Georgia, serif; margin: 0; }
  .doc-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1e5a43; padding-bottom: 12px; margin-bottom: 6px; }
  .doc-header img { height: 56px; width: 56px; object-fit: contain; }
  .doc-header .crest { height: 56px; width: 56px; border: 2px solid #1e5a43; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #1e5a43; font-family: 'Spectral', serif; font-weight: 700; font-size: 18px; }
  .doc-header h1 { color: #1e5a43; font-size: 22px; }
  .doc-header .addr { color: #5a6672; font-size: 11px; margin-top: 2px; }
  .doc-title { text-align: center; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: .2em; font-size: 12px; margin: 14px 0; }
  .doc-sub { color: #5a6672; font-size: 12px; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { background: #ecf1ec; text-align: left; padding: 7px 9px; border-bottom: 1px solid #cdd7cd; font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #4a5560; }
  tbody td { padding: 6px 9px; border-bottom: 1px solid #e7ece7; }
  tbody tr:nth-child(even) { background: #f7f9f6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .muted { color: #5a6672; }
  .foot { margin-top: 18px; font-size: 10.5px; color: #8b95a0; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } .no-print { display: none; } }
`

interface HeaderOpts {
  name: string
  address?: string | null
  logoUrl?: string | null
  title: string
  subtitle?: string
}

export function docHeaderHtml(o: HeaderOpts): string {
  const logo = o.logoUrl
    ? `<img src="${escapeHtml(o.logoUrl)}" alt="" crossorigin="anonymous" />`
    : `<div class="crest">${escapeHtml(o.name.slice(0, 2).toUpperCase())}</div>`
  return `
    <div class="doc-header">
      ${logo}
      <div>
        <h1>${escapeHtml(o.name)}</h1>
        ${o.address ? `<div class="addr">${escapeHtml(o.address)}</div>` : ''}
      </div>
    </div>
    <div class="doc-title">${escapeHtml(o.title)}</div>
    ${o.subtitle ? `<p class="doc-sub">${escapeHtml(o.subtitle)}</p>` : ''}
  `
}

export interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
}

export function tableHtml(columns: Column[], rows: Record<string, unknown>[]): string {
  const head = columns
    .map((c) => `<th class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}">${escapeHtml(c.label)}</th>`)
    .join('')
  const body = rows
    .map((r) => {
      const tds = columns
        .map((c) => `<td class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}">${escapeHtml(r[c.key])}</td>`)
        .join('')
      return `<tr>${tds}</tr>`
    })
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

const FONTS_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">'

/** True when running as an installed PWA (iOS Home-Screen / Android standalone). */
function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/** Web Share (with files) is the only way to Print / Save-to-Files in an iOS PWA. */
function canShareFiles(): boolean {
  return !isTauri() && isStandalone() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
}

/** True inside the Tauri desktop app (its webview has no working window.print()). */
function isTauri(): boolean {
  try {
    return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
  } catch {
    return false
  }
}

type PdfOrientation = 'portrait' | 'landscape'

// Paper sizes in mm [short, long].
const PAGE_MM: Record<string, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  a3: [297, 420],
}
const PDF_MARGIN_MM = 8

/** Usable page width in CSS px for a paper size + orientation (for the render container). */
function pageWidthPx(format: string, orientation: PdfOrientation): number {
  const [short, long] = PAGE_MM[format] ?? PAGE_MM.a4
  const widthMm = orientation === 'landscape' ? long : short
  return Math.round((widthMm - PDF_MARGIN_MM * 2) * (96 / 25.4))
}

/**
 * Desktop-only: ask the user for paper size + orientation before saving a PDF,
 * since the Tauri webview has no native print dialog. A small self-contained
 * modal (no React) so it works from this library. Resolves null on cancel.
 */
function askPdfOptions(): Promise<{ format: string; orientation: PdfOrientation } | null> {
  return new Promise((resolve) => {
    let prevFormat = 'a4'
    let prevOrient: PdfOrientation = 'portrait'
    try {
      prevFormat = localStorage.getItem('pdf.format') || 'a4'
      prevOrient = (localStorage.getItem('pdf.orientation') as PdfOrientation) || 'portrait'
    } catch {
      /* ignore */
    }
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)'
    const selCss =
      'width:100%;padding:9px 10px;border:1px solid var(--border,#ccc);border-radius:8px;background:var(--surface,#fff);color:inherit;font-size:14px;margin-bottom:14px'
    overlay.innerHTML = `
      <div style="background:var(--surface,#fff);color:var(--foreground,#16202a);border:1px solid var(--border,#d5ddd3);border-radius:12px;width:340px;max-width:90vw;padding:22px;font-family:'IBM Plex Sans',system-ui,sans-serif;box-shadow:0 12px 44px rgba(0,0,0,.28)">
        <h2 style="margin:0 0 4px;font-family:'Spectral',Georgia,serif;font-size:18px;font-weight:600">Save as PDF</h2>
        <p style="margin:0 0 16px;font-size:13px;color:var(--muted,#586168)">Choose the paper size and orientation.</p>
        <label style="display:block;font-size:13px;font-weight:500;margin-bottom:5px">Paper size</label>
        <select id="pdf-format" style="${selCss}">
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
          <option value="legal">Legal</option>
          <option value="a3">A3</option>
        </select>
        <label style="display:block;font-size:13px;font-weight:500;margin-bottom:5px">Orientation</label>
        <select id="pdf-orient" style="${selCss}">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
          <button id="pdf-cancel" style="padding:9px 16px;border:1px solid var(--border,#ccc);border-radius:8px;background:var(--surface,#fff);color:inherit;font-size:14px;cursor:pointer">Cancel</button>
          <button id="pdf-ok" style="padding:9px 16px;border:0;border-radius:8px;background:var(--primary,#1e5a43);color:#fff;font-size:14px;font-weight:500;cursor:pointer">Save PDF</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    const fmt = overlay.querySelector('#pdf-format') as HTMLSelectElement
    const ori = overlay.querySelector('#pdf-orient') as HTMLSelectElement
    fmt.value = prevFormat
    ori.value = prevOrient
    const close = (val: { format: string; orientation: PdfOrientation } | null) => {
      overlay.remove()
      resolve(val)
    }
    ;(overlay.querySelector('#pdf-cancel') as HTMLElement).onclick = () => close(null)
    ;(overlay.querySelector('#pdf-ok') as HTMLElement).onclick = () => {
      const val = { format: fmt.value, orientation: ori.value as PdfOrientation }
      try {
        localStorage.setItem('pdf.format', val.format)
        localStorage.setItem('pdf.orientation', val.orientation)
      } catch {
        /* ignore */
      }
      close(val)
    }
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null)
    }
  })
}

function slug(title: string): string {
  return (title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'document'
}

/* ------------------------------------------------------------------ */
/* Desktop / native print — hidden iframe + browser print dialog       */
/* ------------------------------------------------------------------ */
function printViaIframe(html: string) {
  document.getElementById('print-frame')?.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'print-frame'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = iframe.contentDocument || win?.document
  if (!win || !doc) {
    iframe.remove()
    return
  }

  let printed = false
  const trigger = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
      win.print()
    } catch {
      /* ignore */
    }
    win.onafterprint = () => iframe.remove()
    setTimeout(() => iframe.remove(), 60_000)
  }

  iframe.onload = () => setTimeout(trigger, 400)
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(trigger, 1500)
}

/* ------------------------------------------------------------------ */
/* PWA path — render to PDF and open the OS Share sheet                 */
/* ------------------------------------------------------------------ */
interface PdfOptions {
  preferDownload: boolean
  format: string
  orientation: PdfOrientation
  /** Scale the whole render down to a single page (e.g. a report card). */
  fitOnePage?: boolean
}

async function renderToPdf(build: (root: HTMLElement) => void, filename: string, title: string, opts: PdfOptions) {
  const style = document.createElement('style')
  style.textContent = scopedCss('#pdf-root')
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'pdf-root'
  // Off-screen but fully opaque — html2canvas copies opacity/visibility into its
  // render, so a hidden (opacity:0/visibility:hidden) container yields a blank PDF.
  // Container width tracks the chosen page so landscape gives wide tables room.
  root.style.cssText = `position:fixed; left:-10000px; top:0; width:${pageWidthPx(opts.format, opts.orientation)}px; background:#ffffff;`
  build(root)
  document.body.appendChild(root)

  try {
    const blob = await elementToPdfBlob(root, opts.format, opts.orientation, opts.fitOnePage ?? false)
    const preferDownload = opts.preferDownload
    const file = new File([blob], `${filename}.pdf`, { type: 'application/pdf' })
    // Desktop (Tauri): save the file. Mobile PWA: hand it to the OS Share sheet.
    if (!preferDownload && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title })
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') downloadBlob(blob, `${filename}.pdf`)
      }
    } else {
      downloadBlob(blob, `${filename}.pdf`)
    }
  } catch {
    alert('Could not prepare the PDF. Please try again.')
  } finally {
    root.remove()
    style.remove()
  }
}

/**
 * Render a DOM element to a multi-page A4 PDF using html2canvas + jsPDF
 * directly. (html2pdf.js's own jsPDF glue produced blank pages in this bundle.)
 */
async function elementToPdfBlob(
  root: HTMLElement,
  format: string,
  orientation: PdfOrientation,
  fitOnePage = false,
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // Candidate y-positions (in CSS px, relative to the container top) where a
  // page may break without cutting through a row or a section.
  const rect = root.getBoundingClientRect()
  const breakCss: number[] = []
  root
    .querySelectorAll('tr, thead, .doc-header, .doc-title, .doc-sub, .foot, .report-sheet > *')
    .forEach((el) => {
      const b = el.getBoundingClientRect().bottom - rect.top
      if (b > 0) breakCss.push(b)
    })

  const canvas = await html2canvas(root, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const ratio = canvas.height / rect.height // canvas px per CSS px
  const breaks = Array.from(new Set(breakCss.map((b) => Math.floor(b * ratio))))
    .filter((b) => b > 0 && b < canvas.height)
    .sort((a, b) => a - b)

  const pdf = new jsPDF({ unit: 'mm', format, orientation })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2

  // Fit-to-one-page: scale the whole render down so it never spills over.
  if (fitOnePage) {
    const naturalHmm = (canvas.height / canvas.width) * usableW
    let drawW = usableW
    let drawH = naturalHmm
    if (naturalHmm > usableH) {
      drawW = usableW * (usableH / naturalHmm)
      drawH = usableH
    }
    const img = canvas.toDataURL('image/jpeg', 0.95)
    pdf.addImage(img, 'JPEG', margin + (usableW - drawW) / 2, margin, drawW, drawH)
    return pdf.output('blob')
  }

  const pxPerMm = canvas.width / usableW
  const pageHpx = usableH * pxPerMm // one page's worth of content, in canvas px

  let start = 0
  let first = true
  while (start < canvas.height - 1) {
    const maxEnd = start + pageHpx
    let end: number
    if (maxEnd >= canvas.height) {
      end = canvas.height
    } else {
      // Break at the last row/section boundary that fits, but only if it makes
      // reasonable progress; otherwise hard-cut (a single row taller than a page).
      const fit = breaks.filter((b) => b > start + pageHpx * 0.4 && b <= maxEnd)
      end = fit.length ? fit[fit.length - 1] : Math.floor(maxEnd)
    }
    const sliceH = Math.max(1, Math.round(end - start))

    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceH
    const ctx = pageCanvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, sliceH)
    ctx.drawImage(canvas, 0, start, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

    const img = pageCanvas.toDataURL('image/jpeg', 0.95)
    const sliceHmm = sliceH / pxPerMm
    if (!first) pdf.addPage()
    pdf.addImage(img, 'JPEG', margin, margin, usableW, sliceHmm)
    first = false
    start = end
  }

  return pdf.output('blob')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** PRINT_CSS scoped under a root id, so the PDF container never restyles the app. */
function scopedCss(scope: string): string {
  return `
  ${scope} { font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #1a2430; font-size: 12.5px; background: #fff; padding: 16px; }
  ${scope} h1, ${scope} h2, ${scope} h3 { font-family: 'Spectral', Georgia, serif; margin: 0; }
  ${scope} .doc-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1e5a43; padding-bottom: 12px; margin-bottom: 6px; }
  ${scope} .doc-header img { height: 56px; width: 56px; object-fit: contain; }
  ${scope} .doc-header .crest { height: 56px; width: 56px; border: 2px solid #1e5a43; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #1e5a43; font-family: 'Spectral', serif; font-weight: 700; font-size: 18px; }
  ${scope} .doc-header h1 { color: #1e5a43; font-size: 22px; }
  ${scope} .doc-header .addr { color: #5a6672; font-size: 11px; margin-top: 2px; }
  ${scope} .doc-title { text-align: center; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: .2em; font-size: 12px; margin: 14px 0; }
  ${scope} .doc-sub { color: #5a6672; font-size: 12px; margin: 0 0 14px; }
  ${scope} table { width: 100%; border-collapse: collapse; font-size: 12px; }
  ${scope} thead th { background: #ecf1ec; text-align: left; padding: 7px 9px; border-bottom: 1px solid #cdd7cd; font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #4a5560; }
  ${scope} tbody td { padding: 6px 9px; border-bottom: 1px solid #e7ece7; }
  ${scope} tbody tr:nth-child(even) { background: #f7f9f6; }
  ${scope} .num { text-align: right; }
  ${scope} .center { text-align: center; }
  ${scope} .foot { margin-top: 18px; font-size: 10.5px; color: #8b95a0; display: flex; justify-content: space-between; }
  `
}

/* ------------------------------------------------------------------ */
/* Public API — unchanged call sites                                   */
/* ------------------------------------------------------------------ */

/** Print/export standalone body HTML (tables, headers) built by this module. */
export function printHtml(title: string, bodyHtml: string) {
  const foot = `<div class="foot"><span>Generated ${escapeHtml(new Date().toLocaleString())}</span><span>School Platform</span></div>`

  const buildBody = (root: HTMLElement) => {
    root.innerHTML = bodyHtml + foot
  }
  // Tauri desktop: window.print() is a no-op — ask paper size/orientation, then
  // render + save a PDF file. iOS PWA: render + share (A4). Else: print dialog.
  if (isTauri()) {
    void (async () => {
      const opts = await askPdfOptions()
      if (opts) renderToPdf(buildBody, slug(title), title, { preferDownload: true, ...opts })
    })()
    return
  }
  if (canShareFiles()) {
    void renderToPdf(buildBody, slug(title), title, { preferDownload: false, format: 'a4', orientation: 'portrait' })
    return
  }

  printViaIframe(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONTS_LINK}
<style>${PRINT_CSS}</style>
</head>
<body>
${bodyHtml}
${foot}
</body>
</html>`)
}

/**
 * Print a live DOM element (e.g. the rendered report card). On desktop it goes
 * to the print dialog with the app's stylesheets copied in; in a PWA it's
 * rendered to a shareable PDF (the clone keeps the app's styles since it stays
 * in the same document).
 */
export function printNode(el: HTMLElement, title: string, opts: { fit?: boolean } = {}) {
  const fit = opts.fit ?? false
  const buildClone = (root: HTMLElement) => {
    const clone = el.cloneNode(true) as HTMLElement
    clone.style.boxShadow = 'none'
    clone.style.margin = '0'
    clone.style.maxWidth = '100%'
    root.style.padding = '0'
    root.appendChild(clone)
  }
  if (isTauri()) {
    void (async () => {
      const o = await askPdfOptions()
      if (o) renderToPdf(buildClone, slug(title), title, { preferDownload: true, ...o, fitOnePage: fit })
    })()
    return
  }
  if (canShareFiles()) {
    void renderToPdf(buildClone, slug(title), title, {
      preferDownload: false,
      format: 'a4',
      orientation: 'portrait',
      fitOnePage: fit,
    })
    return
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n')
  // When fitting to one page, scale the content down (after fonts/images load)
  // so the browser's print dialog also produces a single page.
  const fitStyle = fit ? '#fit-wrap { transform-origin: top left; }' : ''
  const fitScript = fit
    ? `<script>(function(){
        var mm=96/25.4, pageW=(210-24)*mm, pageH=(297-24)*mm;
        function fit(){
          var w=document.getElementById('fit-wrap'); if(!w) return;
          w.style.transform='none';
          var s=Math.min(pageW/w.scrollWidth, pageH/w.scrollHeight, 1);
          w.style.transform='scale('+s+')';
        }
        window.addEventListener('load', function(){ fit(); setTimeout(fit, 300); });
        if(document.fonts&&document.fonts.ready){ document.fonts.ready.then(fit); }
      })();</script>`
    : ''
  const bodyInner = fit ? `<div id="fit-wrap">${el.outerHTML}</div>` : el.outerHTML
  printViaIframe(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${styles}
<style>@page { margin: 12mm; } html,body { margin: 0; background: #fff; } ${fitStyle}</style>
</head>
<body>${bodyInner}${fitScript}</body>
</html>`)
}
