import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, School, X } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import { navForRole } from '@/config/nav'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/NotificationBell'
import { SyncStatus } from '@/components/SyncStatus'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  bursar: 'Bursar',
  teacher: 'Teacher',
  prefect: 'Prefect',
  parent: 'Parent',
  student: 'Student',
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { activeSchool, activeRole } = useSchool()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const items = navForRole(activeRole)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {activeSchool?.logo_url ? (
              <img src={activeSchool.logo_url} alt="" className="h-9 w-9 rounded-md object-cover" />
            ) : (
              <School className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-sm font-semibold text-foreground">
              {activeSchool?.name ?? 'School Platform'}
            </p>
            <p className="truncate text-xs text-muted">{activeRole ? ROLE_LABEL[activeRole] : ''}</p>
          </div>
          <button
            className="ml-auto text-muted md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted hover:bg-muted-surface hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 px-2 text-xs text-muted">
            <p className="truncate text-foreground">{user?.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-foreground md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-serif font-semibold md:hidden">{activeSchool?.name ?? 'School Platform'}</span>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
