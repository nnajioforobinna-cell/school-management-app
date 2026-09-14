/**
 * Printing / PDF export helpers.
 *
 * We render the content into a hidden same-origin <iframe> and call its print
 * dialog — where the user chooses paper size / orientation and can "Save as
 * PDF". An iframe (rather than window.open) is essential on iOS: inside a
 * Home-Screen / standalone PWA, window.open is blocked and window.print() is a
 * no-op, but printing a hidden iframe works and keeps the user in the app.
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
    ? `<img src="${escapeHtml(o.logoUrl)}" alt="" />`
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

/**
 * Render an HTML document into a hidden iframe and open the print dialog.
 * Works across desktop browsers and iOS standalone PWAs alike.
 */
function printDocument(html: string) {
  // Clean up any iframe left over from a previous print.
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
    // Remove the frame a little after the dialog is dismissed.
    win.onafterprint = () => iframe.remove()
    setTimeout(() => iframe.remove(), 60_000)
  }

  // Trigger once the document (fonts/images) has settled. onload fires after
  // document.write + close; the timeout is a fallback if it already fired.
  iframe.onload = () => setTimeout(trigger, 400)
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(trigger, 1500)
}

/** Print/export standalone body HTML (tables, headers) built by this module. */
export function printHtml(title: string, bodyHtml: string) {
  printDocument(`<!doctype html>
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
<div class="foot"><span>Generated ${new Date().toLocaleString()}</span><span>School Platform</span></div>
</body>
</html>`)
}

/**
 * Print a live DOM element (e.g. the rendered report card) by copying the app's
 * own stylesheets into the print iframe so its Tailwind classes still apply.
 */
export function printNode(el: HTMLElement, title: string) {
  const styles = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((n) => n.outerHTML)
    .join('\n')
  printDocument(`<!doctype html>
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
