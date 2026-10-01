# Architecture — Phase 1

## Data model (DynamoDB, single table `TallyTable`)

Single-table design, partitioned per user. `userId` comes from the Cognito `sub` claim.

| Item              | PK              | SK                          | Notes                                   |
|--------------------|-----------------|------------------------------|------------------------------------------|
| Job                | `USER#<userId>` | `JOB#<jobId>`                 | name, hourlyRate, color                   |
| Shift              | `USER#<userId>` | `SHIFT#<date>#<shiftId>`      | jobId, date (YYYY-MM-DD), start, end, tips |
| Payroll rate config| `USER#<userId>` | `CONFIG#payroll`              | province, OT thresholds — see below       |

- `date` is stored as `YYYY-MM-DD` so a `begins_with` query on `SHIFT#<date>` cheaply
  returns "today" or a whole week (`SHIFT#2026-09-22` .. `SHIFT#2026-09-28` via a
  `between` condition on SK).
- A day can have multiple shifts (e.g. two jobs, or a split shift) — they're just
  separate items sharing the same `date` prefix.

## Payroll rules are config, not code

`CONFIG#payroll` is meant to eventually hold these numbers per-user so updating a
bracket doesn't require a redeploy. For now, `backend/src/lib/payroll.ts` uses a
`DEFAULT_PAYROLL_CONFIG` with **real 2026 figures**, sourced and cited in that file's
header comment:
- CPP (rate, YMPE, CPP2, basic exemption) and EI (rate, max insurable) — from CRA's
  2026 contribution-rate announcements.
- Federal tax brackets and Basic Personal Amount — from CRA's 2026 bracket
  announcement (lowest rate cut to 14% for the full year).
- BC tax brackets — the first two are confirmed from gov.bc.ca and the BC 2026/27
  budget (which raised the lowest rate from 5.06% to 5.60%). **Brackets above
  $100,728 are an unverified placeholder** — fine for typical part-time earnings,
  but must be fixed before this is trusted for anyone earning into that range.
- Deductions are computed by annualizing each pay period's gross (period ×
  periodsPerYear) and applying real marginal brackets — this is the standard
  payroll "periodic method," but there's still no year-to-date tracking across
  periods, so someone who stops working partway through the year will look
  slightly over-deducted here relative to their actual annual return.

## Auth

Implemented, not stubbed: `frontend/src/auth.ts` wraps `amazon-cognito-identity-js`
for sign-up, email confirmation, sign-in, sign-out, and session restore on reload.
`frontend/src/components/AuthView.tsx` is the sign-up/confirm/sign-in UI; `App.tsx`
gates the Shifts/Pay views behind it. Needs `VITE_COGNITO_USER_POOL_ID` and
`VITE_COGNITO_CLIENT_ID` (from the CDK stack's outputs once deployed) in `.env`.

## API surface (API Gateway HTTP API, Cognito JWT authorizer)

| Method | Path                | Handler                        | Purpose                              |
|--------|----------------------|----------------------------------|----------------------------------------|
| GET    | `/jobs`              | `handlers/jobs.list`             | list the user's jobs                   |
| POST   | `/jobs`               | `handlers/jobs.create`           | add a job                              |
| GET    | `/shifts?range=today\|tomorrow\|week` | `handlers/shifts.list` | shifts for a range                     |
| POST   | `/shifts`             | `handlers/shifts.create`         | add a shift (used by the paste parser) |
| PUT    | `/shifts/{id}`        | `handlers/shifts.update`         | edit an existing shift (e.g. time change) |
| DELETE | `/shifts/{id}`        | `handlers/shifts.remove`         | remove a shift                         |
| POST   | `/parse`              | `handlers/parseShift.parse`      | free-text message → structured shift(s) |
| GET    | `/payroll/current`    | `handlers/payroll.current`       | gross/deductions/net for current period |

`POST /parse` is intentionally separate from `POST /shifts`: it returns a *proposed*
structured shift (or several, for multi-shift messages) for the user to confirm/edit
in the UI before it's actually saved via `POST /shifts`. Keeping parsing and saving
as two steps avoids silently mis-filing a shift when the message is ambiguous.

## Frontend

Vite + React, ported from the HTML/CSS prototype (same visual language: `Fraunces` +
`IBM Plex Sans`, teal/amber palette). Gated behind Cognito auth (see above), then two
views: **Shifts** (paste box, Today/Tomorrow, week strip, inline edit) and **Pay**
(gross, deduction breakdown, net, hourly rates). Built as a static bundle and
deployed to S3 + CloudFront.

## Infra (`infra/`, AWS CDK)

`TallyStack` provisions:
- Cognito User Pool + App Client
- DynamoDB table (`TallyTable`, on-demand billing)
- One Lambda per handler (Node.js 20 runtime), least-privilege IAM scoped to the table
- API Gateway HTTP API wired to the Lambdas, with a Cognito JWT authorizer
- S3 bucket + CloudFront distribution for the frontend static build

This is a skeleton with real logic, not just stubs: jobs/shifts CRUD, the paste
parser, payroll math (with cited 2026 rates), and Cognito auth all work end to end
and are type-checked. What's still missing before a real deploy: AWS credentials to
actually `cdk deploy` (not available in this environment), the unverified upper BC
tax brackets noted above, and year-to-date earnings tracking for CPP/EI annual caps.
