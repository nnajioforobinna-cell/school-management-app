/**
 * Deliver a generated file to the user. In an installed PWA on iOS, downloads
 * are blocked, so we hand the file to the OS Share sheet (Save to Files / Mail).
 * On desktop we trigger a normal download.
 */
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

export async function deliverFile(blob: Blob, filename: string, title?: string) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
  if (isStandalone() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title ?? filename })
      return
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return // user cancelled
      // otherwise fall through to a download attempt
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
