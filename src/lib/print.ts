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
async function renderToPdf(build: (root: HTMLElement) => void, filename: string, title: string, preferDownload: boolean) {
  const style = document.createElement('style')
  style.textContent = scopedCss('#pdf-root')
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'pdf-root'
  // Off-screen but fully opaque — html2canvas copies opacity/visibility into its
  // render, so a hidden (opacity:0/visibility:hidden) container yields a blank PDF.
  root.style.cssText = 'position:fixed; left:-10000px; top:0; width:794px; background:#ffffff;'
  build(root)
  document.body.appendChild(root)

  try {
    const blob = await elementToPdfBlob(root)
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
async function elementToPdfBlob(root: HTMLElement): Promise<Blob> {
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

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2
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

  // Tauri desktop: window.print() is a no-op, so render + save a PDF file.
  // iOS PWA: render + share. Everything else: the browser print dialog.
  if (isTauri() || canShareFiles()) {
    void renderToPdf((root) => {
      root.innerHTML = bodyHtml + foot
    }, slug(title), title, isTauri())
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
export function printNode(el: HTMLElement, title: string) {
  if (isTauri() || canShareFiles()) {
    void renderToPdf((root) => {
      const clone = el.cloneNode(true) as HTMLElement
      clone.style.boxShadow = 'none'
      clone.style.margin = '0'
      clone.style.maxWidth = '100%'
      root.style.padding = '0'
      root.appendChild(clone)
    }, slug(title), title, isTauri())
    return
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n')
  printViaIframe(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${styles}
<style>@page { margin: 12mm; } html,body { margin: 0; background: #fff; }</style>
</head>
<body>${el.outerHTML}</body>
</html>`)
}
