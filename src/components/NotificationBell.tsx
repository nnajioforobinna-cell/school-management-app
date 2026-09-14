import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import type { Tables } from '@/types/database'
import { cn } from '@/lib/utils'

type Notification = Tables<'notifications'>

export function NotificationBell() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []) as Notification[]
    },
  })

  const unread = (notifications ?? []).filter((n) => !n.read_at).length

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = (notifications ?? []).filter((n) => !n.read_at).map((n) => n.id)
      if (!ids.length) return
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-muted-surface hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius)] border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-serif text-sm font-semibold text-foreground">Notifications</span>
              {unread > 0 && (
                <button onClick={() => markAll.mutate()} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!notifications || notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li key={n.id} className={cn('px-4 py-3', !n.read_at && 'bg-primary/[0.04]')}>
                      <div className="flex items-start gap-2">
                        {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        <div className={cn(!n.read_at ? '' : 'pl-4')}>
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                          <p className="mt-1 text-xs text-faint">
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
