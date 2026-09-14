# School Management App

A multi-tenant school management platform for Nigerian schools. Built as a responsive
web app on React + Supabase. See [`docs/SPEC.md`](docs/SPEC.md) for the full product and
technical spec.

## Stack

- **React + TypeScript + Vite**
- **Tailwind CSS v4** (scholarly-green design system)
- **Supabase** — Postgres, Auth, Storage, RLS
- **TanStack Query** · **React Hook Form + Zod** · **React Router**

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev
```

### Database

Apply the schema to your Supabase project. Either paste
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) into the Supabase
SQL editor, or use the CLI:

```bash
supabase db push            # with the Supabase CLI linked to your project
```

Then regenerate types (optional, replaces the hand-authored stub):

```bash
supabase gen types typescript --project-id <ref> > src/types/database.ts
```

## First run

1. Sign up / create a user in Supabase Auth (email + password).
2. Log in — you'll be sent to **onboarding** to create your school (you become its owner).
3. Land on the **dashboard**; open **Settings** to complete the school profile and branding.

## Project layout

```
src/
  components/    UI primitives + layout (AppShell, cards, buttons)
  config/        role-based navigation
  lib/           supabase client, query client, utils
  pages/         routed screens
  providers/     auth + active-school/role context
  types/         database types
supabase/
  migrations/    SQL schema + RLS
docs/            product & technical spec
```

## Build status

All four phases are implemented and verified against a live Supabase project.

- **Phase 1 — Foundation:** auth + owner sign-up, onboarding, role-based app shell, school settings (profile, branding, academics), academic structure (sessions, terms, class levels & arms, subjects), student records with passport photos + profiles, staff records with an invite/login flow (Edge Function).
- **Phase 2 — Core operations:** attendance marking, gradebook (CA/Exam with live grades), and printable/publishable report cards.
- **Phase 3 — Money & communication:** fee structures, invoice generation, manual bank-payment recording with receipt upload (invoice totals maintained by a DB trigger), and announcements with in-app notifications (SMS/WhatsApp via Termii-ready Edge Function).
- **Phase 4 — Delight:** dashboard analytics (fee collection, attendance rate, gender split), weekly timetable builder, and assignments.

### Edge Functions
- `invite-user` — creates a confirmed account + role for staff/parents, returns a temp password.
- `send-announcement` — sends SMS via Termii when `TERMII_API_KEY` is set (secrets set in the Supabase dashboard).

### Migrations
`supabase/migrations/` — 0001 core schema + RLS, 0002 student photos, 0003 teacher assessment access, 0004 finance, 0005 timetable + assignments, 0006 trigger-function lockdown.
