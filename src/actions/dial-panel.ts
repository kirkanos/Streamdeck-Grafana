import {
  action,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type DidReceiveSettingsEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { failureText, nextTimeRange } from "../grafana/model";
import { grafana } from "../grafana/service";
import { dialError, dialMessage } from "../render/dial";

// The touch strip is 200x100, but Grafana's d-solo page never becomes ready below
// 144 px height. 288x144 keeps the 2:1 ratio; Stream Deck scales it onto the strip.
const RENDER_WIDTH = 288;
const RENDER_HEIGHT = 144;
import { pngImage } from "../render/keys";
import { updates } from "../throttle";
import { type PanelSettings, panelIdOf, refreshIntervalMs, themeOf, timeRangeOf, unavailableReason } from "./settings";
import { onDashboardChanged, openDashboard, scheduler, startRefresh, stopRefresh, TIME_ZONE } from "./shared";

/** A dial showing one Grafana panel on the touch strip; turn for the time range, push to refresh. */
@action({ UUID: `${PLUGIN_ID}.dial-panel` })
export class DialPanelAction extends SingletonAction<PanelSettings> {
  readonly #settings = new Map<string, PanelSettings>();

  override onWillAppear(ev: WillAppearEvent<PanelSettings>): void {
    this.#apply(ev.action.id, ev.payload.settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<PanelSettings>): void {
    const id = ev.action.id;
    stopRefresh(id);
    updates.forget(id);
    updates.forget(rangeId(id));
    this.#settings.delete(id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PanelSettings>): Promise<void> {
    const settings = await onDashboardChanged(ev.action, this.#settings.get(ev.action.id), ev.payload.settings);
    this.#apply(ev.action.id, settings);
  }

  override async onDialRotate(ev: DialRotateEvent<PanelSettings>): Promise<void> {
    const id = ev.action.id;
    const current = this.#settings.get(id) ?? ev.payload.settings;
    if (unavailableReason(current, grafana.isConfigured) || ev.payload.ticks === 0) {
      return;
    }
    // One step per event, however fast the dial was turned: four ranges only.
    const settings = { ...current, timeRange: nextTimeRange(timeRangeOf(current), Math.sign(ev.payload.ticks)) };
    this.#settings.set(id, settings);
    await ev.action.setSettings(settings);
    this.#showRange(ev.action, settings);
    scheduler.refresh(id);
  }

  override onDialDown(ev: DialDownEvent<PanelSettings>): void {
    scheduler.refresh(ev.action.id);
  }

  override async onTouchTap(ev: TouchTapEvent<PanelSettings>): Promise<void> {
    await openDashboard(ev.action, this.#settings.get(ev.action.id) ?? ev.payload.settings);
  }

  /** Re-renders all visible dials, e.g. after the connection settings changed. */
  refreshAll(): void {
    for (const id of this.#settings.keys()) {
      scheduler.refresh(id);
    }
  }

  #apply(id: string, settings: PanelSettings): void {
    this.#settings.set(id, settings);
    const dial = this.actions.find((a) => a.id === id);
    if (dial?.isDial()) {
      this.#showRange(dial, settings);
    }
    startRefresh(id, () => this.#render(id), refreshIntervalMs(settings));
  }

  /** The time range label in the corner of the strip; shown right away, before the render arrives. */
  #showRange(dial: DialAction<PanelSettings>, settings: PanelSettings): void {
    const label = unavailableReason(settings, grafana.isConfigured) ? "" : timeRangeOf(settings);
    updates.update(rangeId(dial.id), label, (value) => dial.setFeedback({ range: value }));
  }

  async #render(actionId: string): Promise<void> {
    const dial = this.actions.find((a) => a.id === actionId);
    const settings = this.#settings.get(actionId);
    if (!dial?.isDial() || !settings) {
      return;
    }

    const show = (canvas: string) => updates.update(dial.id, canvas, (value) => dial.setFeedback({ canvas: value }));

    const unavailable = unavailableReason(settings, grafana.isConfigured);
    if (unavailable) {
      show(dialMessage(unavailable.title, unavailable.subtitle === "Grafana in settings" ? "Grafana in the dial settings" : `${unavailable.subtitle} in the dial settings`));
      return;
    }

    const uid = settings.dashboardUid!;
    const result = await grafana.render({
      uid,
      slug: await grafana.slugFor(uid),
      panelId: panelIdOf(settings)!,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      range: timeRangeOf(settings),
      theme: themeOf(settings),
      tz: TIME_ZONE,
    });
    if (this.#settings.get(actionId) !== settings) {
      return;
    }
    if (result.ok) {
      show(pngImage(result.png));
    } else {
      const { title, detail } = failureText(result);
      show(dialError(title, detail));
    }
  }
}

/** Throttle id of the range label, separate from the canvas image. */
function rangeId(actionId: string): string {
  return `${actionId}:range`;
}
