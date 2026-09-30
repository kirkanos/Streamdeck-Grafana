# Grafana Panel

Any [Grafana](https://grafana.com) panel as a live image on your Elgato Stream Deck: keys and the touch strip show a rendered panel, refreshed on an interval.

Unofficial plugin, not affiliated with Grafana Labs.

## Features

* **Panel** key: one Grafana panel rendered by the Grafana image renderer, refreshed every 10 seconds to every hour (default: every minute). No custom drawing, so power, temperatures, request rates or anything else you already have in Grafana works.
  * Press the key to open the dashboard in your browser, with the panel in view mode.
  * Hold the key to refresh the panel right away.
  * Time range (1h, 6h, 24h, 7d) and theme (dark or light) per key.
  * A gray key with a warning icon and the HTTP status code when the render fails (for example `HTTP 401 · check token`).
* **Dial Panel** (Stream Deck + / + XL): the panel on the touch strip at 200×100 pixels, which suits time series and graphs. Turn the dial to switch the time range, push it to refresh, tap the strip to open the dashboard. The current time range is shown in the corner of the strip.
* Dashboard and panel pickers in the key settings, fed from the Grafana API (dashboards grouped by folder, panels grouped by row).
* At most one render per key is in flight, at most two across all keys, and the first renders of a page are staggered, so a page full of panels does not hit Grafana all at once.

Stat, gauge and bar gauge panels are the recommendation for keys (they are rendered at 144×144 pixels); time series are better readable on the touch strip.

## Installation

Download the [latest release](https://github.com/kirkanos/Streamdeck-Grafana/releases/latest) and open `com.kirkanos.grafana.streamDeckPlugin`. Requires Stream Deck 7.1 or newer.

## Settings

The rendered picture already carries the panel title, so the key shows no Stream Deck title by default. If you type one, untick *Show title* in the key's title settings or leave the title empty, otherwise it covers the panel name.

The connection is shared by all keys and dials and set up once in the settings of any key:

1. In Grafana, create a service account with the **Viewer** role (Administration → Users and access → Service accounts) and add a token to it.
2. In the key settings, enter the Grafana URL (for example `https://grafana.example.com`) and the token, then click *Save and test connection*. The plugin checks the token against `/api/org` and shows the organization it belongs to.
3. Pick a dashboard and a panel. Time range, refresh interval and theme are optional.

The token is stored in the Stream Deck settings on this computer and only sent to the Grafana URL you entered.

## Prerequisites

The plugin uses the Grafana render API (`/render/d-solo/...`), which needs the [Grafana image renderer](https://grafana.com/grafana/plugins/grafana-image-renderer/). With Docker Compose, add the renderer as a service next to Grafana and point Grafana at it:

```yaml
services:
  grafana:
    image: grafana/grafana
    environment:
      GF_RENDERING_SERVER_URL: http://renderer:8081/render
      GF_RENDERING_CALLBACK_URL: http://grafana:3000/
    depends_on:
      - renderer

  renderer:
    image: grafana/grafana-image-renderer
    restart: unless-stopped
```

The renderer runs a headless Chromium and needs roughly 300 MB of memory. A render takes 1 to 3 seconds per panel, so keep the refresh interval reasonable when many keys show panels.

Grafana must be reachable from this computer with token authentication (no SSO login page in front of the API).

## Development

Grafana Panel is a Node.js plugin built with the official [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/) (`@elgato/streamdeck`, TypeScript, rollup). The settings pages use [sdpi-components](https://sdpi-components.dev).

| Path | Content |
| --- | --- |
| `src/actions/` | One class per Stream Deck action, plus the shared settings and refresh helpers |
| `src/grafana/` | Grafana HTTP API: render URLs, dashboard JSON, connection service |
| `src/render/` | SVG placeholders for keys and touch strips (errors, "select a panel") |
| `src/scheduler.ts` | Refresh jobs with bounded concurrency and staggered starts |
| `plugin/` | Static plugin files: manifest, icons, settings pages (`ui/`), dial layout |
| `assets/` | Plugin icon source (rendered to PNG by the build) |
| `scripts/` | Build |

```sh
npm install
npm test               # unit tests
npm run typecheck

# Development: a parallel-installable copy "Grafana Panel (dev)"
npm run link:dev       # build + link into Stream Deck (once)
npm run watch:dev      # rebuild and restart the plugin on every change

npm run validate       # build + validate the plugin folder
npm run pack           # Release/com.kirkanos.grafana.streamDeckPlugin
```

Linking and restarting need the Stream Deck developer mode (`npx streamdeck dev`, then restart the Stream Deck app once). Plugin logs are written to `dist/<plugin id>.sdPlugin/logs/`.

GitHub Actions builds and tests every push (`.github/workflows/ci.yml`) and publishes a release with the packed plugin for tags like `v1.0.0` (`.github/workflows/release.yml`).

## Troubleshooting

* **Keys show "Set up":** open the settings of a key and enter the Grafana URL and a service account token.
* **Keys show "HTTP 401" or "HTTP 403":** the token was rejected; create a new one for the service account and enter it again.
* **Keys show "HTTP 404":** the panel no longer exists on the dashboard; pick another one.
* **Keys show "HTTP 500" or "No image":** Grafana cannot render images. Check that the image renderer is running and configured (see Prerequisites).
* **Keys show "Timeout" or "Offline":** Grafana or the renderer is slow or unreachable from this computer.
* Anything else: [open an issue](https://github.com/kirkanos/Streamdeck-Grafana/issues).
