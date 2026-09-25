# Roadmap

## Phase 1 — Personal core (this repo, in progress)
- Auth (Cognito)
- Jobs + hourly rates
- Paste a shift message → parsed → confirmed → saved
- Direct shift editing (no approval needed — no manager exists yet)
- Today / Tomorrow / This week views, multiple shifts per day
- Weekly / monthly hour totals
- Pay view: gross, CPP/EI/federal/provincial deductions, overtime (>8h/day),
  statutory holiday pay, net

## Phase 2 — Google Calendar
- OAuth2 + Free/Busy API (not full event details)
- Conflict warning when a new/edited shift overlaps a personal appointment

## Phase 3 — Manager role
- Cognito Groups (`employee` / `manager`) + `Store` entity
- Staff invites
- Manager dashboard: staff list, assign/edit shifts for staff, team payroll view

## Phase 4 — Shift requests (needs Phase 3)
- Swap between two employees (peer accept → manager approval)
- Give away a shift
- Shift correction requests — once a manager exists, an employee-proposed time
  change needs manager sign-off instead of being a direct edit

## Explicitly out of scope
- No in-app payment processing — payroll figures are for visibility only.
