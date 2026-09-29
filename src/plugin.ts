import streamDeck from "@elgato/streamdeck";
import { DialPanelAction } from "./actions/dial-panel";
import { PanelAction } from "./actions/panel";
import type { PanelSettings } from "./actions/settings";
import { sendPanelItems } from "./actions/shared";
import { dashboardItems } from "./grafana/model";
import { grafana, type GrafanaSettings } from "./grafana/service";

type JsonValue = Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0];

streamDeck.logger.setLevel("info");

const panel = new PanelAction();
const dial = new DialPanelAction();

streamDeck.actions.registerAction(panel);
streamDeck.actions.registerAction(dial);

// New connection settings: every key and dial renders again (or shows "Set up").
grafana.on("settings", () => {
  panel.refreshAll();
  dial.refreshAll();
  sendToPropertyInspector(statusMessage());
});

grafana.on("state", () => {
  streamDeck.logger.info(`grafana connection: ${grafana.state}${grafana.error ? ` (${grafana.error})` : ""}`);
  sendToPropertyInspector(statusMessage());
});

// Messages from the property inspectors (ui/*.html).

type UiMessage =
  | { event: "getDashboards" | "getPanels" | "getStatus"; isRefresh?: boolean }
  | { event: "connect"; url: string; token?: string };

streamDeck.ui.onSendToPlugin<UiMessage, PanelSettings>(async (ev) => {
  const message = ev.payload;
  switch (message.event) {
    case "getStatus":
      sendToPropertyInspector(statusMessage());
      break;
    case "getDashboards": {
      let items: JsonValue = [];
      if (grafana.isConfigured) {
        try {
          items = dashboardItems(await grafana.dashboards(Boolean(message.isRefresh)));
        } catch (err) {
          streamDeck.logger.warn(`dashboards: ${(err as Error).message}`);
        }
      }
      sendToPropertyInspector({ event: "getDashboards", items });
      break;
    }
    case "getPanels": {
      const settings = await ev.action.getSettings();
      await sendPanelItems(settings.dashboardUid);
      break;
    }
    case "connect": {
      // An empty token keeps the stored one, so the URL can be changed alone.
      const token = message.token?.trim() || grafana.settings.token;
      const settings: GrafanaSettings = { url: message.url.trim().replace(/\/+$/, ""), token };
      await streamDeck.settings.setGlobalSettings(settings);
      grafana.configure(settings);
      const result = await grafana.verify();
      sendToPropertyInspector({ event: "connect", ...result });
      break;
    }
  }
});

function statusMessage(): JsonValue {
  return {
    event: "status",
    state: grafana.state,
    url: grafana.settings.url ?? "",
    error: grafana.error ?? "",
    org: grafana.org ?? "",
    configured: grafana.isConfigured,
  };
}

function sendToPropertyInspector(payload: JsonValue): void {
  if (streamDeck.ui.action) {
    streamDeck.ui.sendToPropertyInspector(payload).catch(() => undefined);
  }
}

streamDeck.settings.onDidReceiveGlobalSettings<GrafanaSettings>((ev) => grafana.configure(ev.settings));

await streamDeck.connect();
grafana.configure(await streamDeck.settings.getGlobalSettings<GrafanaSettings>());
if (grafana.isConfigured) {
  void grafana.verify();
}
