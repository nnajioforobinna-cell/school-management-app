# School Management App — Product & Technical Spec

**Version:** 0.1 (draft)
**Last updated:** 2026-09-12
**Author:** Obinna (with Claude)

---

## 1. Vision

A modern, fast, beautiful school management platform that schools actually *want* to use — not the bloated, ugly systems that dominate this space. It gives every stakeholder (admin, teacher, parent, student, owner) a focused experience, nails the boring-but-critical core (records, attendance, grades, fees), and becomes indispensable through great communication.

**Guiding principles**
1. **Design per-role, not per-feature.** Each user type gets a focused UI, not one shared cluttered menu.
2. **The boring core must be bulletproof.** Report cards and money can never be wrong.
3. **Communication is the retention engine.** Daily-use value lives here.
4. **Built for the real environment.** Low-end Android, patchy internet, SMS matters.
5. **Multi-tenant foundation, single-school launch.** Architect for many, validate with one.
6. **Auditable by design.** Every sensitive change is logged; minors' data is protected.

---

## 2. Key architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tenancy model | **Multi-tenant, shared DB + RLS** | Cheap now in Supabase; painful to retrofit. One `school_id` column + RLS policies isolate data per school. |
| Platform | **Responsive web app** | One codebase, all roles, all devices, no app stores. Mobile-first layouts. |
| Frontend | **React + TypeScript + Vite**, **Tailwind CSS**, **shadcn/ui** | Fast, modern, component-driven, great DX. shadcn gives polished accessible components you own. |
| State/data | **TanStack Query** + Supabase client | Caching, optimistic updates, offline-tolerant fetching. |
| Routing | **React Router** | Standard, role-based route guards. |
| Backend | **Supabase** (Postgres, Auth, Storage, Edge Functions, Realtime) | Auth + DB + file storage + serverless in one. RLS for tenant isolation. |
| Auth | **Supabase Auth** (email/password + magic link) | Row-level identity tied to every query. |
| Forms | **React Hook Form + Zod** | Type-safe validation shared between client and Edge Functions. |
| Payments | **Manual/offline recording** (pluggable for online later) | Nigerian context: students pay into the school bank account and bring a receipt. The app records payments, not processes them. Online gateway can be added later without a rewrite. |
| Notifications | **Email + SMS + WhatsApp + in-app** | SMS/WhatsApp are first-class, not afterthoughts. |
| Hosting | **Vercel / Netlify** (frontend) + Supabase (backend) | Zero-ops, preview deploys. |

---

## 3. Roles & permissions

Roles are **per-school** (a user could be a parent at one school and a teacher at another). Permissions are checked both in the UI (hide/show) and in the database (RLS — the real gate).

| Role | Scope | Can do |
|---|---|---|
| **Super Admin** (platform) | All schools | Manage the SaaS: onboard schools, billing, support. Not a school role. |
| **School Owner / Proprietor** | One school | Everything in their school + dashboards, money, staff management. |
| **School Admin / Registrar** | One school | Day-to-day admin: students, staff, classes, timetable, fees, reports. |
| **Teacher** | Assigned classes/subjects | Attendance, grades, assignments, comms with their students' parents. |
| **Parent / Guardian** | Their children only | View results, attendance, fees; pay; receive & send messages. |
| **Student** | Self | Timetable, assignments, results. |
| **Accountant / Bursar** (optional) | One school | Fees, invoices, payments, financial reports. |

Permissions modeled as: `roles`, `permissions`, `role_permissions`, and `user_school_roles` (a user ↔ school ↔ role mapping). This keeps it flexible without hard-coding role checks everywhere.

---

## 4. Core data model

Every domain table includes `school_id` (tenant key) and standard columns (`id`, `created_at`, `updated_at`, `created_by`). RLS policy on every table: `school_id = current user's active school`.

### Tenancy & identity
- **schools** — `id, name, slug, address, phone, email, logo_url, motto, settings (jsonb), subscription_status`
- **profiles** — extends Supabase `auth.users`: `id, full_name, phone, avatar_url`
- **user_school_roles** — `user_id, school_id, role_id, status`
- **roles / permissions / role_permissions** — RBAC

### Academic structure
- **academic_sessions** — `id, school_id, name (e.g. "2025/2026"), start_date, end_date, is_current`
- **terms** — `id, session_id, name ("First Term"), start_date, end_date, is_current`
- **class_levels** — `id, school_id, name ("JSS1"), order`
- **class_arms** — `id, class_level_id, name ("A"), class_teacher_id, capacity`
- **subjects** — `id, school_id, name, code, is_core`

### People
- **students** — `id, school_id, admission_no, first_name, last_name, dob, gender, photo_url, status`
- **enrollments** — `id, student_id, class_arm_id, session_id, status` (a student's class per session — this is how you handle promotion/repetition across years)
- **guardians** — `id, school_id, user_id, full_name, phone, relationship`
- **student_guardians** — links students ↔ guardians (many-to-many; is_primary, can_pickup)
- **staff** — `id, school_id, user_id, staff_no, title, department, employment_status`
- **subject_teachers** — `staff_id, subject_id, class_arm_id, session_id`

### Daily operations
- **attendance** — `id, school_id, enrollment_id, date, status (present/absent/late/excused), marked_by`
- **assessments** — `id, school_id, subject_id, class_arm_id, term_id, name ("1st CA"), type, max_score, weight`
- **scores** — `id, assessment_id, student_id, score, remark`
- **report_cards** — computed/snapshotted per student per term: totals, grades, position, comments, `published_at`
- **grading_schemes** — `id, school_id, name, bands (jsonb: A=70-100 etc.)` — configurable per school

### Money
- **fee_structures** — `id, school_id, class_level_id, session_id, name, amount, is_recurring`
- **invoices** — `id, school_id, student_id, session_id, term_id, total, status, due_date`
- **invoice_items** — lines on an invoice
- **payments** — `id, invoice_id, amount, method ("bank_transfer"/"cash"), bank_name, teller_no, reference, receipt_image_url, status, paid_at, recorded_by`

### Communication & trust
- **announcements** — `id, school_id, title, body, audience (jsonb filters), channels[], published_at`
- **messages / threads** — 1:1 and group messaging (teacher ↔ parent)
- **notifications** — per-user in-app inbox
- **audit_logs** — `id, school_id, actor_id, action, entity, entity_id, before (jsonb), after (jsonb), created_at`

---

## 5. Feature modules & build phases

### Phase 1 — Foundation *(must be rock-solid before anything else)*
- Supabase project, schema, RLS policies, seed data
- Auth: signup/login, password reset, invite flow
- **School setup / Settings** (see §6) — create school, set details, logo, branding
- Roles & permissions, user invitations
- Academic structure: sessions, terms, class levels, arms, subjects
- Student enrollment & records (CRUD, bulk import via CSV)
- Staff records
- Role-based app shell: sidebar/nav that adapts per role

### Phase 2 — Core operations *(the daily-use heart)*
- **Attendance** — fast marking (whole class in one screen), offline-tolerant, reports
- **Gradebook** — enter CA/exam scores per subject, configurable grading schemes
- **Report cards** — auto-compute totals, grades, class position; teacher & principal comments; publish to parents; printable/PDF

### Phase 3 — Money & communication *(makes it indispensable)*
- **Fees** — fee structures per class/session, auto-generate invoices, track balances
- **Payments (manual)** — bursar/admin records a payment against an invoice: amount, bank, teller/reference number, date, and an uploaded photo of the physical bank receipt (Supabase Storage). Auto-updates the student's balance, generates an in-app receipt, and flags duplicates/over-payments. No online gateway for now (pluggable later).
- **Announcements** — targeted (whole school / class / individual), multi-channel (in-app, email, SMS, WhatsApp)
- **Messaging** — teacher ↔ parent threads
- **Automated alerts** — absence alerts, fee reminders, result-published notifications

### Phase 4 — Delight & differentiation
- **Dashboards & analytics** — enrollment trends, revenue, attendance rates, performance (role-specific)
- **Timetable** — builder + per-class/teacher/student views
- **Assignments / lightweight LMS** — post assignments, submissions, grading
- **Library, transport, hostel** — optional modules
- **Report card analytics** — term-over-term performance for parents

---

## 6. School setup / Settings page *(your requirement)*

A dedicated, well-organized Settings area — the first thing an admin touches after signup. Organized into tabs:

1. **School profile** — name, motto/slogan, address, phone, email, website
2. **Branding** — logo upload (Supabase Storage), primary color (used on reports & the app), report-card header
3. **Academics** — grading scheme/bands, pass mark, position-ranking on/off, current session & term
4. **Fees & payments** — currency, payment provider keys, invoice prefix, receipt footer
5. **Communication** — SMS/WhatsApp sender ID, email-from name, which alerts are automatic
6. **Roles & staff** — invite users, assign roles
7. **Users & security** — active sessions, audit log access, data export
8. **Subscription** (SaaS) — plan, billing, usage

School `settings` live partly in dedicated columns (name, logo, etc.) and partly in a flexible `settings` JSONB column for toggles, so we can add options without migrations.

---

## 7. Non-functional requirements

- **Security:** RLS on every table (the real tenant boundary); minors' data access logged; least-privilege roles; signed URLs for file access.
- **Offline tolerance:** attendance & grading should queue locally and sync (TanStack Query + local persistence) — teachers often have weak connectivity.
- **Performance:** mobile-first, small bundles, paginated lists, indexed queries on `(school_id, ...)`.
- **Auditability:** `audit_logs` for grade changes, fee edits, role changes, deletions.
- **Data portability:** CSV import (students/staff) and export; per-school data export for compliance.
- **Internationalization-ready:** currency, date formats, and labels configurable per school.
- **Accessibility:** keyboard navigation, contrast, screen-reader labels (shadcn/Radix helps here).

---

## 8. Open questions / to decide later

- ~~Payment provider~~ → **Decided:** no online gateway. Manual recording of bank payments + receipt upload.
- ~~Parent self-registration~~ → **Decided:** parents are always invited by the school (invite-only).
- ~~SMS/WhatsApp provider~~ → **Decided:** channels are **SMS + WhatsApp**. Default provider **Termii** (Nigerian, does both + email via one API); channel layer kept pluggable (Africa's Talking / Twilio swappable).
- ~~Report card format~~ → **Decided:** no existing template to match; custom elegant design (see `report-card` mockup). Columns: Subject · CA (/40) · Exam (/60) · Total (/100) · Grade · Remark, plus bio, attendance, summary/position, grading key, affective & psychomotor domains, class-teacher & principal comments, resumption date.
- Subscription/pricing model for the SaaS (per-student? flat per-school? per-term?). — *still open*

---

## 9. Suggested next steps

1. Confirm/adjust this spec.
2. Scaffold the project (Vite + React + TS + Tailwind + shadcn + Supabase client).
3. Design the Supabase schema + RLS as the first migration.
4. Build Phase 1, starting with auth + school setup/settings.
