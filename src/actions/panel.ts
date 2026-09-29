import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { failureText } from "../grafana/model";
import { grafana } from "../grafana/service";
import { errorKey, messageKey, pngImage } from "../render/keys";
import { showImage, updates } from "../throttle";
import { type PanelSettings, panelIdOf, refreshIntervalMs, themeOf, timeRangeOf, unavailableReason } from "./settings";
import { onDashboardChanged, openDashboard, scheduler, startRefresh, stopRefresh, TIME_ZONE } from "./shared";

/** Key images are drawn at 144×144 and scaled by Stream Deck. */
const KEY_SIZE = 144;

/** Holding the key this long forces a refresh instead of opening the dashboard. */
export const LONG_PRESS_MS = 600;

/** A key showing one Grafana panel; press opens the dashboard, a long press refreshes. */
@action({ UUID: `${PLUGIN_ID}.panel` })
export class PanelAction extends SingletonAction<PanelSettings> {
  readonly #settings = new Map<string, PanelSettings>();
  readonly #pressTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #longPressed = new Set<string>();

  override onWillAppear(ev: WillAppearEvent<PanelSettings>): void {
    this.#apply(ev.action.id, ev.payload.settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<PanelSettings>): void {
    const id = ev.action.id;
    stopRefresh(id);
    updates.forget(id);
    this.#settings.delete(id);
    this.#clearPress(id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PanelSettings>): Promise<void> {
    const settings = await onDashboardChanged(ev.action, this.#settings.get(ev.action.id), ev.payload.settings);
    this.#apply(ev.action.id, settings);
  }

  override onKeyDown(ev: KeyDownEvent<PanelSettings>): void {
    const id = ev.action.id;
    this.#clearPress(id);
    this.#pressTimers.set(
      id,
      setTimeout(() => {
        this.#pressTimers.delete(id);
        this.#longPressed.add(id);
        scheduler.refresh(id);
      }, LONG_PRESS_MS),
    );
  }

  override async onKeyUp(ev: KeyUpEvent<PanelSettings>): Promise<void> {
    const id = ev.action.id;
    const timer = this.#pressTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.#pressTimers.delete(id);
    }
    if (this.#longPressed.delete(id)) {
      return;
    }
    await openDashboard(ev.action, this.#settings.get(id) ?? ev.payload.settings);
  }

  /** Re-renders all visible keys, e.g. after the connection settings changed. */
  refreshAll(): void {
    for (const id of this.#settings.keys()) {
      scheduler.refresh(id);
    }
  }

  #apply(id: string, settings: PanelSettings): void {
    this.#settings.set(id, settings);
    startRefresh(id, () => this.#render(id), refreshIntervalMs(settings));
  }

  #clearPress(id: string): void {
    const timer = this.#pressTimers.get(id);
    if (timer) {
      clearTimeout(timer);
    }
    this.#pressTimers.delete(id);
    this.#longPressed.delete(id);
  }

  async #render(actionId: string): Promise<void> {
    const key = this.actions.find((a) => a.id === actionId);
    const settings = this.#settings.get(actionId);
    if (!key?.isKey() || !settings) {
      return;
    }

    const unavailable = unavailableReason(settings, grafana.isConfigured);
    if (unavailable) {
      showImage(key, messageKey(unavailable.title, unavailable.subtitle));
      return;
    }

    const uid = settings.dashboardUid!;
    const result = await grafana.render({
      uid,
      slug: await grafana.slugFor(uid),
      panelId: panelIdOf(settings)!,
      width: KEY_SIZE,
      height: KEY_SIZE,
      range: timeRangeOf(settings),
      theme: themeOf(settings),
      tz: TIME_ZONE,
    });
    // Settings changed while rendering: a render with the new ones is already queued.
    if (this.#settings.get(actionId) !== settings) {
      return;
    }
    if (result.ok) {
      showImage(key, pngImage(result.png));
    } else {
      const { title, detail } = failureText(result);
      showImage(key, errorKey(title, detail));
    }
  }
}
