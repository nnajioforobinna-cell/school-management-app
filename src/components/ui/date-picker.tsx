import { useEffect, useMemo, useState } from 'react'
import { Select } from '@/components/ui/select'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year: number, month: number) {
  if (!year || !month) return 31
  return new Date(year, month, 0).getDate()
}

const pad = (n: number) => String(n).padStart(2, '0')

interface Parts {
  y: number
  m: number
  d: number
}

function parse(value: string | null | undefined): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!match) return { y: 0, m: 0, d: 0 }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

interface Props {
  value: string // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void
  id?: string
  minYear?: number
  maxYear?: number
  className?: string
}

/**
 * Day / Month / Year dropdown date picker. Holds each part in internal state so
 * selecting them one at a time accumulates; emits an ISO 'YYYY-MM-DD' string
 * once all three are set (and '' until then).
 */
export function DatePicker({ value, onChange, id, minYear, maxYear, className }: Props) {
  const now = new Date()
  const max = maxYear ?? now.getFullYear() + 10
  const min = minYear ?? now.getFullYear() - 70

  const [parts, setParts] = useState<Parts>(() => parse(value))

  // Re-sync when the parent sets a *complete* date from outside (e.g. editing a
  // different record). Incomplete/empty external values don't wipe in-progress
  // selections.
  useEffect(() => {
    const p = parse(value)
    if (p.y && p.m && p.d) {
      setParts((cur) => (cur.y === p.y && cur.m === p.m && cur.d === p.d ? cur : p))
    }
  }, [value])

  const years = useMemo(() => {
    const arr: number[] = []
    for (let yr = max; yr >= min; yr--) arr.push(yr)
    return arr
  }, [min, max])

  const update = (patch: Partial<Parts>) => {
    setParts((cur) => {
      const next = { ...cur, ...patch }
      if (next.y && next.m && next.d) {
        const cd = Math.min(next.d, daysInMonth(next.y, next.m))
        next.d = cd
        onChange(`${next.y}-${pad(next.m)}-${pad(cd)}`)
      } else {
        onChange('')
      }
      return next
    })
  }

  const dayCount = daysInMonth(parts.y || now.getFullYear(), parts.m || 1)

  return (
    <div id={id} className={`grid min-w-[13rem] grid-cols-[1fr_1.4fr_1.1fr] gap-2 ${className ?? ''}`}>
      <Select value={parts.d || ''} onChange={(e) => update({ d: Number(e.target.value) })} aria-label="Day">
        <option value="">Day</option>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((dd) => (
          <option key={dd} value={dd}>{dd}</option>
        ))}
      </Select>
      <Select value={parts.m || ''} onChange={(e) => update({ m: Number(e.target.value) })} aria-label="Month">
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </Select>
      <Select value={parts.y || ''} onChange={(e) => update({ y: Number(e.target.value) })} aria-label="Year">
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </Select>
    </div>
  )
}
