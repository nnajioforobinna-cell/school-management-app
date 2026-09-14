import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import { landingPath, routeRoles } from '@/config/nav'
import { AppShell } from '@/components/layout/AppShell'
import { FullScreenLoader } from '@/components/ui/spinner'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ClassesPage } from '@/pages/ClassesPage'
import { SubjectsPage } from '@/pages/SubjectsPage'
import { StudentsPage } from '@/pages/StudentsPage'
import { StudentProfilePage } from '@/pages/StudentProfilePage'
import { StaffPage } from '@/pages/StaffPage'
import { StaffProfilePage } from '@/pages/StaffProfilePage'
import { AttendancePage } from '@/pages/AttendancePage'
import { GradebookPage } from '@/pages/GradebookPage'
import { ReportCardsPage } from '@/pages/ReportCardsPage'
import { FeesPage } from '@/pages/FeesPage'
import { AnnouncementsPage } from '@/pages/AnnouncementsPage'
import { TimetablePage } from '@/pages/TimetablePage'
import { AssignmentsPage } from '@/pages/AssignmentsPage'
import { UsersPage } from '@/pages/UsersPage'

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireSchool() {
  const { memberships, loading } = useSchool()
  if (loading) return <FullScreenLoader />
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/" replace />
  return <LoginPage />
}

function OnboardingRoute() {
  const { memberships, loading } = useSchool()
  if (loading) return <FullScreenLoader />
  if (memberships.length > 0) return <Navigate to="/" replace />
  return <OnboardingPage />
}

/** Role-gates a route; sends users who lack access to their own home page. */
function Allow({ path, element }: { path: string; element: ReactNode }) {
  const { activeRole } = useSchool()
  const roles = routeRoles(path)
  if (roles && activeRole && !roles.includes(activeRole)) {
    return <Navigate to={landingPath(activeRole)} replace />
  }
  return <>{element}</>
}

function RedirectHome() {
  const { activeRole } = useSchool()
  return <Navigate to={landingPath(activeRole)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingRoute />} />

        <Route element={<RequireSchool />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Allow path="/" element={<DashboardPage />} />} />
            <Route path="/settings" element={<Allow path="/settings" element={<SettingsPage />} />} />
            <Route path="/users" element={<Allow path="/users" element={<UsersPage />} />} />
            <Route path="/students" element={<Allow path="/students" element={<StudentsPage />} />} />
            <Route path="/students/:id" element={<Allow path="/students/:id" element={<StudentProfilePage />} />} />
            <Route path="/staff" element={<Allow path="/staff" element={<StaffPage />} />} />
            <Route path="/staff/:id" element={<Allow path="/staff/:id" element={<StaffProfilePage />} />} />
            <Route path="/classes" element={<Allow path="/classes" element={<ClassesPage />} />} />
            <Route path="/subjects" element={<Allow path="/subjects" element={<SubjectsPage />} />} />
            <Route path="/attendance" element={<Allow path="/attendance" element={<AttendancePage />} />} />
            <Route path="/gradebook" element={<Allow path="/gradebook" element={<GradebookPage />} />} />
            <Route path="/report-cards" element={<Allow path="/report-cards" element={<ReportCardsPage />} />} />
            <Route path="/fees" element={<Allow path="/fees" element={<FeesPage />} />} />
            <Route path="/announcements" element={<Allow path="/announcements" element={<AnnouncementsPage />} />} />
            <Route path="/timetable" element={<Allow path="/timetable" element={<TimetablePage />} />} />
            <Route path="/assignments" element={<Allow path="/assignments" element={<AssignmentsPage />} />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<RedirectHome />} />
    </Routes>
  )
}
