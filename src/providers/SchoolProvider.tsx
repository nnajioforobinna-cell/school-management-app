import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import type { AppRole, SchoolRow } from '@/types/database'

export interface Membership {
  school: SchoolRow
  role: AppRole
}

interface SchoolContextValue {
  memberships: Membership[]
  activeSchool: SchoolRow | null
  activeRole: AppRole | null
  loading: boolean
  setActiveSchoolId: (id: string) => void
  refetch: () => void
}

const SchoolContext = createContext<SchoolContextValue | undefined>(undefined)
const STORAGE_KEY = 'active_school_id'

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['memberships', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('user_school_roles')
        .select('role, school:schools(*)')
        .eq('status', 'active')
      if (error) throw error
      return (data ?? [])
        .filter((r) => r.school)
        .map((r) => ({
          role: r.role as AppRole,
          school: r.school as unknown as SchoolRow,
        }))
    },
  })

  const memberships = data ?? []

  const activeSchool = useMemo(() => {
    if (!memberships.length) return null
    const match = memberships.find((m) => m.school.id === activeId)
    return (match ?? memberships[0]).school
  }, [memberships, activeId])

  const activeRole = useMemo(() => {
    if (!activeSchool) return null
    return memberships.find((m) => m.school.id === activeSchool.id)?.role ?? null
  }, [memberships, activeSchool])

  const setActiveSchoolId = (id: string) => {
    setActiveId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* ignore storage failures */
    }
  }

  const value: SchoolContextValue = {
    memberships,
    activeSchool,
    activeRole,
    loading: isLoading,
    setActiveSchoolId,
    refetch,
  }

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSchool() {
  const ctx = useContext(SchoolContext)
  if (!ctx) throw new Error('useSchool must be used within <SchoolProvider>')
  return ctx
}
