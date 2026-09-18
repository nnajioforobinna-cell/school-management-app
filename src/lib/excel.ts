/**
 * Excel (.xlsx) export. Reuses the same column/row shape as the print helpers,
 * so any table that can be printed can also be exported to Excel. Numeric cells
 * stay numeric so the bursar can sum/filter them in Excel.
 */
import { deliverFile } from '@/lib/download'
import type { Column } from '@/lib/print'

export interface Sheet {
  name: string
  columns: Column[]
  rows: Record<string, unknown>[]
}

export async function exportSheets(filename: string, sheets: Sheet[], title?: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const header = sheet.columns.map((c) => c.label)
    const body = sheet.rows.map((r) => sheet.columns.map((c) => normalize(r[c.key])))
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    ws['!cols'] = sheet.columns.map((c) => ({ wch: Math.max(String(c.label).length + 2, 14) }))
    XLSX.utils.book_append_sheet(wb, ws, sanitizeName(sheet.name))
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await deliverFile(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, title ?? filename)
}

/** Single-sheet convenience wrapper. */
export function exportSheet(filename: string, columns: Column[], rows: Record<string, unknown>[], sheetName = 'Sheet1', title?: string) {
  return exportSheets(filename, [{ name: sheetName, columns, rows }], title)
}

function normalize(v: unknown): string | number {
  if (v == null) return ''
  if (typeof v === 'number') return v
  return String(v)
}

// Excel sheet names: <=31 chars, no : \ / ? * [ ]
function sanitizeName(name: string): string {
  return (name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
}
