import {
  LayoutDashboard,
  Users,
  UserCog,
  GraduationCap,
  Layers,
  BookOpen,
  ClipboardCheck,
  NotebookPen,
  FileText,
  Receipt,
  Megaphone,
  CalendarDays,
  ClipboardList,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { AppRole } from '@/types/database'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: AppRole[]
}

// Role groups
export const ALL: AppRole[] = ['owner', 'admin', 'bursar', 'teacher', 'parent', 'student', 'prefect']
export const ADMIN: AppRole[] = ['owner', 'admin']
export const FINANCE: AppRole[] = ['owner', 'admin', 'bursar']
export const GRADERS: AppRole[] = ['owner', 'admin', 'teacher'] // Gradebook only
export const ATTENDANCE_TAKERS: AppRole[] = ['owner', 'admin', 'prefect']
export const VIEWERS: AppRole[] = ['owner', 'admin', 'student', 'parent']

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'bursar'] },
  { to: '/students', label: 'Students', icon: GraduationCap, roles: ADMIN },
  { to: '/staff', label: 'Staff', icon: Users, roles: ADMIN },
  { to: '/classes', label: 'Classes', icon: Layers, roles: ADMIN },
  { to: '/subjects', label: 'Subjects', icon: BookOpen, roles: ADMIN },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ATTENDANCE_TAKERS },
  { to: '/gradebook', label: 'Gradebook', icon: NotebookPen, roles: GRADERS },
  { to: '/report-cards', label: 'Report cards', icon: FileText, roles: ADMIN },
  { to: '/timetable', label: 'Timetable', icon: CalendarDays, roles: VIEWERS },
  { to: '/assignments', label: 'Assignments', icon: ClipboardList, roles: VIEWERS },
  { to: '/fees', label: 'Fees', icon: Receipt, roles: FINANCE },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, roles: ADMIN },
  { to: '/users', label: 'Users & Access', icon: UserCog, roles: ADMIN },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ADMIN },
]

// Routes not shown in the sidebar (detail pages) still need access control.
const EXTRA_ROUTE_ROLES: Record<string, AppRole[]> = {
  '/students/:id': ADMIN,
  '/staff/:id': ADMIN,
}

export function navForRole(role: AppRole | null): NavItem[] {
  if (!role) return []
  return NAV.filter((item) => item.roles.includes(role))
}

/** Roles allowed to access a given route path, or null if unknown (allow all). */
export function routeRoles(path: string): AppRole[] | null {
  const nav = NAV.find((n) => n.to === path)
  if (nav) return nav.roles
  return EXTRA_ROUTE_ROLES[path] ?? null
}

/** Where a role should land after login (roles without a dashboard get their home page). */
export function landingPath(role: AppRole | null): string {
  if (role === 'prefect') return '/attendance'
  if (role === 'teacher') return '/gradebook'
  return '/'
}
