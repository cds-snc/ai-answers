# Testing and Dev Quick Reference

Read this before writing tests, running tests, or doing local dev setup.

## Test Commands

| Command | What it runs |
|---------|-------------|
| `npm test` | All unit/integration tests (Vitest) |
| `npm run test:services` | Service tests only, verbose output |
| `npm run test:e2e` | Playwright E2E tests (headless) |
| `npm run test:e2e:headed` | Playwright E2E tests (browser visible) |
| `npm run lint` | ESLint on `src/**/*.{js,jsx}` |

## Test Frameworks

- **Unit/integration:** Vitest (config in `vitest.config.js`)
- **E2E:** Playwright (run via `scripts/run-e2e-tests.ps1`)
- **React testing:** `@testing-library/react` + `@testing-library/jest-dom`

## Vitest Config Highlights

| Setting | Value |
|---------|-------|
| Default environment | `node` |
| Environment for `src/**` | `jsdom` |
| Test timeout | 20 seconds |
| Hook timeout | 60 seconds |
| Setup file | `test/setup.js` (MongoDB Memory Server) |
| Mock handling | Cleared and restored between tests |
| Isolation | Single-thread pool |
| Excluded from Vitest | `tests/e2e/**`, node_modules, dist |

## Test File Locations

| Location | What's tested |
|----------|--------------|
| `__tests__/` (root) | API handlers, auth, dashboard filters, redaction |
| `services/__tests__/` | Backend services (Answer, Search, Vector, etc.) |
| `agents/__tests__/` | Agent prompts |
| `agents/graphs/__tests__/` | Graph workflows |
| `agents/graphs/services/__tests__/` | Graph-internal services |
| `agents/strategies/__tests__/` | Strategy implementations |
| `api/chat/__tests__/` | Chat API handlers |
| `api/util/__tests__/` | Utility API handlers |
| `src/pages/__tests__/` | React page components |
| `src/services/__tests__/` | Client-side services |
| `src/components/chat/__tests__/` | Chat UI components |
| `tests/e2e/` | Playwright E2E specs (5 spec files) |

## Test Setup (`test/setup.js`)

- Uses `mongodb-memory-server` for an in-memory MongoDB instance
- Auto-creates and tears down DB per test run
- Set `SKIP_MONGO_SETUP=true` to skip DB setup for isolated tests

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

### Docker (optional)

`docker-compose.yml` provides MongoDB (27017) and Qdrant (6333).

## ESLint Rules

- Parser: `@babel/eslint-parser` (JSX support)
- Semicolons required
- Import extensions required for `.js`/`.jsx`
- `no-unused-vars`: warn (not error)
- React prop-types: off
- Test files get Jest environment globals
