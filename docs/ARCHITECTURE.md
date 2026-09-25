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

`CONFIG#payroll` holds the numbers that change yearly / by province (CPP rate, EI rate,
federal/provincial tax brackets, overtime thresholds, statutory holiday formula
inputs). `backend/src/lib/payroll.ts` reads this config rather than hardcoding rates,
so updating a bracket doesn't require a redeploy of the calculation logic itself —
just a data update. **The actual bracket numbers in `payroll.ts` right now are
illustrative placeholders and must be verified against current CRA/BC figures (or a
compliance library) before this is used for anything real.**

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
`IBM Plex Sans`, teal/amber palette). Two views: **Shifts** (paste box, Today/
Tomorrow, week strip, inline edit) and **Pay** (gross, deduction breakdown, net,
hourly rates). Built as a static bundle and deployed to S3 + CloudFront.

## Infra (`infra/`, AWS CDK)

`TallyStack` provisions:
- Cognito User Pool + App Client
- DynamoDB table (`TallyTable`, on-demand billing)
- One Lambda per handler (Node.js 20 runtime), least-privilege IAM scoped to the table
- API Gateway HTTP API wired to the Lambdas, with a Cognito JWT authorizer
- S3 bucket + CloudFront distribution for the frontend static build

This is a skeleton: handlers have real DynamoDB read/write logic for jobs and shifts,
but the parser and payroll calculation are stubbed with clear `TODO`s — those need
product decisions (which parsing approach, which compliance source for tax figures)
before they're production-ready.
