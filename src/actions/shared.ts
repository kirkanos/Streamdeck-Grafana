import streamDeck, { type Action } from "@elgato/streamdeck";
import { dashboardUrl, panelItems } from "../grafana/model";
import { grafana } from "../grafana/service";
import { RefreshScheduler } from "../scheduler";
import { type PanelSettings, panelIdOf, timeRangeOf } from "./settings";

/** Time zone of the render requests: the machine's, as the dashboard in the browser would use. */
export const TIME_ZONE = ((): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  } catch {
    return "Europe/Berlin";
  }
})();

/** Render functions of all visible keys and dials, keyed by action id. */
const renderers = new Map<string, () => Promise<void>>();

/** One scheduler for all keys and dials: bounded concurrency and staggered starts. */
export const scheduler = new RefreshScheduler((id) => renderers.get(id)?.() ?? Promise.resolve(), {
  maxConcurrent: 2,
  staggerMs: 400,
});

/** Registers the render function of a key/dial and starts its refresh job. */
export function startRefresh(id: string, render: () => Promise<void>, intervalMs: number): void {
  renderers.set(id, render);
  scheduler.start(id, intervalMs);
}

export function stopRefresh(id: string): void {
  scheduler.stop(id);
  renderers.delete(id);
}

/** Opens the dashboard of the key in the browser, with the panel in view mode. */
export async function openDashboard(action: Action<PanelSettings>, settings: PanelSettings): Promise<void> {
  const { url } = grafana.settings;
  if (!url || !settings.dashboardUid) {
    if (action.isKey() || action.isDial()) {
      await action.showAlert();
    }
    return;
  }
  const slug = await grafana.slugFor(settings.dashboardUid);
  await streamDeck.system.openUrl(
    dashboardUrl({ baseUrl: url, uid: settings.dashboardUid, slug, panelId: panelIdOf(settings), range: timeRangeOf(settings) }),
  );
}

/**
 * Called with the previous and the new settings of a key when the property
 * inspector changed them. If the dashboard changed, the panel of the old
 * dashboard is dropped and the panel picker is fed the new panel list.
 * Returns the settings the key should keep.
 */
export async function onDashboardChanged(action: Action<PanelSettings>, previous: PanelSettings | undefined, next: PanelSettings): Promise<PanelSettings> {
  if (!previous || previous.dashboardUid === next.dashboardUid) {
    return next;
  }
  let settings = next;
  if (panelIdOf(next) !== undefined) {
    settings = { ...next, panelId: undefined };
    await action.setSettings(settings);
  }
  if (streamDeck.ui.action?.id === action.id) {
    await sendPanelItems(next.dashboardUid);
  }
  return settings;
}

/** Sends the panel picker items of a dashboard to the visible property inspector. */
export async function sendPanelItems(dashboardUid: string | undefined): Promise<void> {
  let items: ReturnType<typeof panelItems> = [];
  if (dashboardUid && grafana.isConfigured) {
    try {
      items = panelItems(await grafana.panels(dashboardUid));
    } catch (err) {
      streamDeck.logger.warn(`panels of ${dashboardUid}: ${(err as Error).message}`);
    }
  }
  if (streamDeck.ui.action) {
    await streamDeck.ui.sendToPropertyInspector({ event: "getPanels", items }).catch(() => undefined);
  }
}
