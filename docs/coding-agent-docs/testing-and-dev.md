# Testing and Dev Quick Reference

Read this before writing tests, running tests, or doing local dev setup.

## Test Commands

| Command | What it runs |
|---------|-------------|
| `npm test` | All unit/integration tests (Vitest) |
| `npm run test:services` | Service tests only, verbose output |
| `npm run test:e2e` | Playwright E2E tests, headless (PowerShell only) |
| `npm run test:e2e:headed` | Playwright E2E tests, browser visible (PowerShell only) |
| `npm run lint` | ESLint on `src/**/*.{js,jsx}` |

## Test Frameworks

- **Unit/integration:** Vitest (config in `vitest.config.js`)
- **E2E:** Playwright (config in `playwright.config.js`)
- **React testing:** `@testing-library/react` + `@testing-library/jest-dom`

### Running E2E on macOS or Linux

The `test:e2e*` scripts need PowerShell — `scripts/run-e2e-tests.ps1` starts the server, then calls `npx playwright`. Without `pwsh`, do both steps yourself:

```bash
npm run dev:quick    # in one terminal
npx playwright test  # in another; add --headed to watch
```

`playwright.config.js` defaults to `TEST_ENV=dev` (localhost:3001) and fills in E2E credentials. Set `TEST_ENV=sandbox` or `production` to point elsewhere.

## Vitest Config Highlights

| Setting | Value |
|---------|-------|
| Default environment | `node` |
| Environment for `src/**` | `jsdom` |
| Test timeout | 20 seconds |
| Hook timeout | 60 seconds |
| Setup files (per test file) | `test/vitest-hooks.js` |
| Global setup (once per run) | `test/setup.js` — MongoDB Memory Server |
| Mock handling | Cleared and restored between tests |
| Isolation | Single-thread pool |
| Excluded from Vitest | `tests/e2e/**`, node_modules, dist |

## Test File Locations

Tests go in a `__tests__/` folder beside the code they cover — `src/components/chat/__tests__/`, `services/__tests__/`, `agents/graphs/__tests__/` and so on. Put a new test where its subject lives; don't add it to a central folder.

Two places break that rule:

| Location | What's there |
|----------|--------------|
| `__tests__/` (root) | Tests spanning several modules — API handlers, auth, dashboard filters, redaction |
| `tests/e2e/` | Playwright specs (not run by Vitest) |

## Test Setup

- Uses `mongodb-memory-server` for an in-memory MongoDB instance
- Auto-creates and tears down DB per test run
- Set `SKIP_MONGO_SETUP=true` to skip DB setup for isolated tests
- `test/vitest-hooks.js` runs per test: resets the DB, unmounts React Testing Library renders

## Local Development

### Quick start (recommended)

```bash
npm run dev:quick
```

Runs `scripts/start-quick.js` which:
1. Starts MongoDB Memory Server (in-memory, non-persistent)
2. Seeds default users: `admin@admin.com` / `admin`, `partner@example.com` / `partner`
3. Starts backend (port 3001) and frontend (port 3000)

### Full dev

```bash
npm run dev
```

Runs concurrently: in-memory MongoDB + backend server + React frontend.

### Testing with a referring URL locally

The chat receives a referring URL via the `ref` query parameter (URL-encoded). To simulate this locally, append it to the dev URL:

```
http://localhost:3000/en?ref=https%3A%2F%2Fwww.canada.ca%2Fen%2Frevenue-agency%2Fservices%2Fe-services%2Fcra-login-services.html
```

The referring URL will pre-populate in the chat input. This is how the real embed passes the page URL to the chat.

### Docker (optional)

`docker-compose.yml` provides MongoDB (27017) and Redis (6379). The `qdrant_data` volume is a leftover — there is no Qdrant service.

## ESLint Rules

- Parser: `@babel/eslint-parser` (JSX support)
- Semicolons required
- Import extensions required for `.js`/`.jsx`
- `no-unused-vars`: warn (not error)
- React prop-types: off
- Test files get Jest environment globals
