# Streamdeck-Grafana

Stream Deck plugin `com.kirkanos.grafana`. Status: M1 to M3 implemented (see README.md); M0 and M4 open.

## Goal

Any Grafana panel as a picture on a key or the touch strip, refreshed on an interval. No custom drawing, so power, temperatures, proxy requests or anything else already in Grafana works.

## Keys & dials

- **Panel** key: PNG from the render API, refreshed every N seconds. Press opens the dashboard in the browser, long press forces a refresh. Shows a gray key with an error icon when the render fails.
- **Dial**: touch strip renders the panel at 200x100, turn switches the time range (1h, 6h, 24h, 7d), push forces a refresh.

## Data source & API

- Grafana render API: `GET /render/d-solo/{uid}/{slug}?orgId=1&panelId={id}&width=144&height=144&theme=dark&from=now-1h&to=now&tz=Europe/Berlin` with `Authorization: Bearer <service account token>`.
- Panel picker: `GET /api/search?type=dash-db` for dashboards, `GET /api/dashboards/uid/{uid}` for the panel list.
- Prerequisite in the Grafana stack (`../grafana/grafana/docker-compose.yaml`): a `renderer` service (`grafana/grafana-image-renderer`) plus `GF_RENDERING_SERVER_URL=http://renderer:8081/render` and `GF_RENDERING_CALLBACK_URL=http://grafana:3000/` on the Grafana service. Grafana is reachable without an SSO proxy in front of it (it does OIDC itself), so token auth works directly.

## Settings

- Base URL, service account token (Viewer role is enough).
- Dashboard and panel (datasource-fed selects), refresh interval, time range, theme.

## Open questions

- Memory footprint of the renderer (Chromium, roughly 300 MB) on the Docker host.
- Whether time series are readable at 72x72. Stat and gauge panels will be the recommendation; the touch strip suits graphs better.
- Cache: the render API is slow (1 to 3 s per panel). Keep at most one render per key in flight.

## Milestones

- M0: add the renderer to the Grafana stack (commit in the `grafana` repo, deployed via Woodpecker).
- M1: Panel key with manual UID and panel ID.
- M2: dashboard and panel pickers, error handling.
- M3: dial with time range and touch strip.
- M4: CI workflows, release `v1.0.0`.

## Scaffold

Copy the tooling from [Kuma Glance](https://github.com/kirkanos/kuma-glance) (`../Streamdeck-Uptime-Kuma`), not from Termine:

- `@elgato/streamdeck` ^3, `@elgato/cli`, TypeScript, rollup via `scripts/build.mjs` and `createRollupConfig()` from its `rollup.config.mjs`; `tsconfig` extends `@tsconfig/node20`, `moduleResolution: Bundler`, `customConditions: ["node"]`.
- Manifest: SDKVersion 3, Nodejs 24, `Software.MinimumVersion` 7.1, version `0.0.0.0` (the build fills it in).
- Layout: `plugin/` (manifest, `ui/`, `layouts/`, icons), `src/plugin.ts`, `src/actions/`, `src/<service>/`, `src/render/` (reuse `svg.ts` and `theme.ts`).
- Dev variant `<uuid>-dev` via `--dev`, `npm run link:dev`, `npm run watch:dev`.
- Settings pages: static HTML with vendored sdpi-components 4.0.1 in `plugin/ui/`.
- CI: `.github/workflows/ci.yml` (typecheck, vitest, pack, artifact) and `release.yml` (tag `v*`, `PLUGIN_VERSION`, `gh release create`).
- Tests: vitest for model and render code, like `render.test.ts` in Kuma Glance.
- Secrets live in the action settings, never in global settings. Passwords are exchanged for a token once and not stored.
- No license for now.
