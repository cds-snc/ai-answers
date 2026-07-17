# Plan: Migrate frontend from Create React App to Vite

## Context

The frontend is still built and served with Create React App via `react-scripts`, but CRA is now deprecated and the app is already feeling the security pressure from transitive dependencies like `webpack-dev-server`. The repo is a client-rendered React SPA served by the existing Express backend, so the least risky path is to replace the build tool, not the application architecture.

Key repo facts that shape the plan:

- `server/server.js` serves the frontend from `../build` and falls back to `build/index.html` for non-API routes.
- `Dockerfile` and `Dockerfile.lambda` both build the frontend in a separate stage and copy `/app/build` into the runtime image.
- The app already uses Vitest for tests, so the main migration work is frontend build and dev-server plumbing.
- Frontend code still uses CRA-era env access (`process.env.REACT_APP_*`) in a few places.
- There is no `src/setupProxy.js`; the current local-dev proxy assumption lives in comments and the `proxy` field in `package.json`.

## Goal

Replace CRA with Vite, keep the current Express-served SPA shape, and get the app running with tests passing while removing `react-scripts` and the vulnerable CRA dependency chain from the frontend build.

## Non-goals

- Do not change the backend API shape or the Express routing model.
- Do not introduce SSR or a framework migration.
- Do not redesign the router or page URLs.
- Do not change the runtime config contract in `server/server.js` unless the build migration forces it.

## Approach

Use Vite as a drop-in build tool replacement for the existing SPA.

Why this is the right fit here:

1. The app already has a server-side entrypoint and build artifact contract (`build/`) that Vite can preserve.
2. The frontend is not relying on CRA-specific abstraction layers beyond HTML entrypoint, env vars, and dev-server proxy behavior.
3. Vite keeps the migration surface smaller than moving to Next.js or React Router framework mode.

## Implementation Steps

### 1. Replace CRA tooling in `package.json`

- Remove `react-scripts` from dependencies.
- Remove the `eject` script.
- Add `vite` and `@vitejs/plugin-react` as dev dependencies.
- Change `start` to `vite --host 0.0.0.0`.
- Change `build` to `vite build`.
- Keep the existing Vitest, Playwright, and backend scripts as-is.

### 2. Add a Vite config

Create `vite.config.js` with:

- `@vitejs/plugin-react`
- `build.outDir = 'build'` so Express and Docker keep serving the same output path
- `server.port = Number(process.env.PORT || 3000)`
- `server.host = '0.0.0.0'`
- proxy rules for `/api` and `/config.js` to `http://localhost:3001` during local development

This preserves the current dev workflow where the frontend talks to the backend on port `3001`.

### 3. Move the HTML entrypoint

- Move `public/index.html` to the repo root as `index.html`.
- Add the Vite module entry script for `src/index.js`.
- Keep the existing metadata, favicon, public image references, and `<div id="root"></div>`.
- Leave the other public assets in `public/` so Vite can serve them normally.

### 4. Update frontend env usage

Replace CRA-style browser env access in `src/` with Vite's runtime model:

- `process.env.REACT_APP_ENV` -> `import.meta.env.MODE` or `import.meta.env.PROD`
- `process.env.REACT_APP_API_URL` -> `import.meta.env.VITE_API_URL`
- `process.env.REACT_APP_ADOBE_ANALYTICS_URL` -> `import.meta.env.VITE_ADOBE_ANALYTICS_URL`

Keep the backend-generated `/config.js` contract intact, because the server already injects runtime values there and that path is independent of the frontend build tool.

### 5. Update app code and comments that assume CRA

- Refresh comments in `src/utils/apiToUrl.js` so they describe the Vite dev proxy rather than CRA's proxy.
- Update `scripts/start-quick.js` so the inline comments and dev-start assumptions reflect Vite.
- Audit any other browser-side `process.env` reads in `src/` and convert them to `import.meta.env` where appropriate.

### 6. Adjust Docker build stages

Update `Dockerfile` and `Dockerfile.lambda` so the build stage installs dev dependencies:

- Use `npm ci` in the build stage instead of `npm install --omit=dev`.
- Keep the runtime stages on production-only installs with `npm ci --omit=dev`.
- Continue copying the generated `/app/build` directory into the runtime image.

This matters because Vite is a dev dependency, but the production runtime should still stay lean.

### 7. Remove CRA residue once the new build works

After the Vite build is confirmed:

- Remove `react-scripts` from `package-lock.json`.
- Remove any unused CRA-only compatibility dependency if it is no longer needed.
- Delete `public/index.html` if it would otherwise conflict with the new root HTML entry.
- Update any stale documentation or comments that still refer to CRA-specific behavior.

## Verification

### Build and runtime

- Run `npm run build`.
- Start the server with the built frontend in place and verify:
  - `/`
  - `/en`
  - `/fr`
  - `/config.js`
  - a protected route fallback handled by Express

### Tests

- Run `npm test`.
- Run at least one E2E smoke test, preferably `npm run test:e2e -- tests/e2e/chat-test.spec.js`.
- If the build migration touches dev-server behavior, run the full E2E suite before merge.

### Dependency/security checks

- Run `npm ls react-scripts webpack-dev-server` and confirm the CRA chain is gone.
- Run `npm audit` and confirm the `webpack-dev-server` advisory is no longer present.
- Review any remaining audit output separately so unrelated issues are not accidentally folded into this migration.

### Docker

- Run `docker build .` or the equivalent CI build path.
- Confirm the final image starts and serves the app through Express on port `3001`.

## Risks

- **Env variable drift:** browser-side `process.env.REACT_APP_*` usage can break quietly if not converted to `import.meta.env`.
- **Output path mismatch:** if Vite does not emit to `build/`, the Express server and Docker image will stop serving the frontend.
- **Dev-server assumptions:** local development currently expects backend proxying behavior; Vite needs explicit proxy config.
- **Docker build stages:** if the build stage still installs production-only deps, `vite build` will fail because Vite lives in dev dependencies.

## Assumptions

- Vite SPA is the intended replacement, not a framework migration.
- The app remains client-rendered and Express-served.
- Node `20+` is acceptable for the build and runtime images.
- Success means `react-scripts` is gone, the app builds and runs, and the relevant tests pass with no new frontend security holes introduced by the migration.
