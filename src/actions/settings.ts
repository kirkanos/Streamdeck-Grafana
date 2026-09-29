import { DEFAULT_TIME_RANGE, isTimeRange, type Theme, type TimeRange } from "../grafana/model";

/** Settings of a Panel key or Dial Panel, as stored by the property inspector. */
export type PanelSettings = {
  dashboardUid?: string;
  panelId?: string | number;
  /** Seconds between two renders; select values arrive as strings. */
  refreshSeconds?: string | number;
  timeRange?: string;
  theme?: string;
};

export const DEFAULT_REFRESH_SECONDS = 60;
export const MIN_REFRESH_SECONDS = 10;

/** Refresh interval in milliseconds, with the default for missing or invalid values and a lower bound. */
export function refreshIntervalMs(settings: PanelSettings): number {
  const seconds = Number(settings.refreshSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_REFRESH_SECONDS * 1000;
  }
  return Math.max(MIN_REFRESH_SECONDS, seconds) * 1000;
}

export function timeRangeOf(settings: PanelSettings): TimeRange {
  return isTimeRange(settings.timeRange) ? settings.timeRange : DEFAULT_TIME_RANGE;
}

export function themeOf(settings: PanelSettings): Theme {
  return settings.theme === "light" ? "light" : "dark";
}

export function panelIdOf(settings: PanelSettings): string | undefined {
  const id = settings.panelId === undefined ? "" : String(settings.panelId).trim();
  return id === "" ? undefined : id;
}

export type Unavailable = { title: string; subtitle: string };

/** Why a key cannot show a panel yet (no connection, nothing selected), or undefined if it can. */
export function unavailableReason(settings: PanelSettings, configured: boolean): Unavailable | undefined {
  if (!configured) {
    return { title: "Set up", subtitle: "Grafana in settings" };
  }
  if (!settings.dashboardUid) {
    return { title: "Select", subtitle: "a dashboard" };
  }
  if (panelIdOf(settings) === undefined) {
    return { title: "Select", subtitle: "a panel" };
  }
  return undefined;
}
