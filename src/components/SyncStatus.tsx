import { RefreshCw } from 'lucide-react'
import { useSync } from '@/providers/SyncProvider'

/**
 * Compact connectivity / sync indicator for the app header. Always visible, so
 * the user can tell at a glance whether the app is Live, Offline, or Syncing —
 * and whether any changes are still waiting to reach the server.
 */
export function SyncStatus() {
  const { online, pending, syncing, syncNow } = useSync()

  // Offline — amber, shows how many changes are queued locally.
  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
        title="No connection — changes are saved on this device and will sync when you're back online"
      >
        <Dot className="bg-warning" />
        Offline{pending > 0 ? ` · ${pending}` : ''}
      </span>
    )
  }

  // Actively pushing the queue.
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing…
      </span>
    )
  }

  // Online but changes are still queued — tap to push them now.
  if (pending > 0) {
    return (
      <button
        onClick={() => void syncNow()}
        className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/15"
        title="Changes waiting to sync — tap to sync now"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {pending} pending
      </button>
    )
  }

  // Online, nothing queued — everything is up to date.
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
      title="Online — all changes saved to the server"
    >
      <Dot className="bg-success" pulse />
      Live
    </span>
  )
}

/** A small status dot, optionally with a soft pulsing ring. */
function Dot({ className, pulse }: { className: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${className}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${className}`} />
    </span>
  )
}
