# Partnership Return Guide

A private, front-end-only interview that prepares a **reviewable draft** of the official 2025 IRS Form 1065 for a narrow early-stage LLC scenario.

The app runs entirely in the browser, persists ordinary answers locally, and generates the PDF without sending tax data to a server.

## Supported scenario

The guided path is intentionally limited to:

- A domestic multi-member LLC taxed as a partnership
- A calendar tax year ending December 31, 2025
- One managing member with at least 50% ownership
- Two to four individual partners with no ownership changes during 2025
- Cash-basis records
- Less than $2,000 in actual customer receipts
- Simple member capital contributions and cash distributions
- No inventory, payroll, foreign activity, rentals, debt, depreciable property, digital assets, guaranteed payments, tax credits, or specialized elections

The interview explicitly separates **customer receipts** from **member contributions**. Personal funds deposited by a member are not treated as business revenue.

## What it generates

- The official six-page 2025 Form 1065, filled in-browser
- A simple Schedule L, M-1, and M-2 when the Schedule B question 4 exception is unavailable
- An appended statement for page 1, line 21 other deductions when needed
- An informational late-filing estimate based on the official `$255 × partners × months or partial months` formula, capped at 12 months

## What it does not generate

- Schedules K-1
- Schedule B-1 for a 50% or greater owner
- State partnership returns
- E-file data
- Partner allocations, basis, liabilities, or capital-account tax positions
- A reasonable-cause request or guarantee of penalty relief
- Signatures or a filing-ready representation

The application is a preparation aid, not tax, legal, accounting, or filing advice. A qualified tax professional should review the complete filing package.

## Privacy

- No backend, analytics, account, or cloud storage
- Draft answers are stored in IndexedDB on the current browser
- Names and addresses are autosaved for reuse
- The partnership EIN is intentionally removed from automatic saves
- Manual JSON exports contain the current draft, including the EIN if entered
- **Clear data** removes the locally saved draft

## Official IRS sources

- [2025 Form 1065 PDF](https://www.irs.gov/pub/irs-prior/f1065--2025.pdf)
- [2025 Instructions for Form 1065](https://www.irs.gov/pub/irs-prior/i1065--2025.pdf)
- [About Form 1065](https://www.irs.gov/forms-pubs/about-form-1065)

The pinned IRS PDFs are stored in `public/forms/` so PDF generation works reliably on GitHub Pages without depending on cross-origin browser access to IRS servers.

## Development

```powershell
npm install
npm run dev
```

## Validation

```powershell
npm test
npm run lint
npm run build
```

Tests cover:

- Contributions remaining separate from revenue
- Golden-path and unsupported eligibility outcomes
- Schedule B question 4 behavior
- Original and extended filing deadlines
- Month-or-partial-month penalty estimates
- PDF round-trip assertions against the official IRS fields

## Deployment

The Vite base path is `/form-1065-interviewer/`.

```powershell
npm run deploy
```

This builds the app and publishes `dist/` to the `gh-pages` branch. Review the repository and generated output before deploying; this command should not be run until publishing is explicitly approved.
