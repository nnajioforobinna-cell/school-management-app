import { FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Paired PDF/Print and Excel export buttons used across the app's list views. */
export function ExportButtons({
  onPdf,
  onExcel,
  size,
}: {
  onPdf: () => void
  onExcel: () => void
  size?: 'sm'
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="outline" size={size} onClick={onPdf}>
        <Printer className="h-4 w-4" /> PDF
      </Button>
      <Button variant="outline" size={size} onClick={onExcel}>
        <FileSpreadsheet className="h-4 w-4" /> Excel
      </Button>
    </div>
  )
}
