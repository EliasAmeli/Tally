# Tally

A tracker for people juggling multiple part-time jobs: paste a shift message and it's
parsed onto your schedule automatically, hours roll up into weekly/monthly stats, and
payroll (gross, CPP/EI/tax deductions, overtime, holiday pay) is estimated live from
logged hours.

**Phase 1 scope:** single-user, self-managed. No manager role yet — see
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what comes later (manager role, shift
requests/approvals, Google Calendar conflict detection).

## Stack

- **Frontend:** React + Vite, deployed as a static site to S3 + CloudFront.
- **Backend:** Node.js/TypeScript Lambda functions behind API Gateway (HTTP API).
- **Auth:** Amazon Cognito (User Pool + JWT authorizer on the API).
- **Data:** DynamoDB, single-table design, partitioned per user.
- **Infra:** AWS CDK (TypeScript) — see `infra/`.

## Repo layout

```
frontend/   React app (the UI)
backend/    Lambda handlers (the API)
infra/      AWS CDK stack (DynamoDB, Cognito, API Gateway, Lambda, S3/CloudFront)
docs/       Architecture notes and roadmap
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model and API surface.
