import { CloudOff, RefreshCw, Cloud } from 'lucide-react'
import { useSync } from '@/providers/SyncProvider'
import { cn } from '@/lib/utils'

/** Compact connectivity / sync indicator for the app header. */
export function SyncStatus() {
  const { online, pending, syncing, syncNow } = useSync()

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
        <CloudOff className="h-3.5 w-3.5" />
        Offline{pending > 0 ? ` · ${pending} to sync` : ''}
      </span>
    )
  }

  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing…
      </span>
    )
  }

  if (pending > 0) {
    return (
      <button
        onClick={() => void syncNow()}
        className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/15"
        title="Sync pending changes now"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {pending} pending
      </button>
    )
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-success')}
      title="Online — all changes saved"
    >
      <Cloud className="h-3.5 w-3.5" />
      Synced
    </span>
  )
}
