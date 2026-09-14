declare module 'html2pdf.js' {
  interface Html2PdfWorker {
    set(opt: Record<string, unknown>): Html2PdfWorker
    from(element: HTMLElement | string): Html2PdfWorker
    outputPdf(type: 'blob'): Promise<Blob>
    save(): Promise<void>
  }
  function html2pdf(): Html2PdfWorker
  export default html2pdf
}
