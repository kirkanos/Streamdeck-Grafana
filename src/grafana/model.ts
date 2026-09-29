/** Pure helpers around the Grafana HTTP API: URLs, dashboard JSON, time ranges. */

export type TimeRange = "1h" | "6h" | "24h" | "7d";

/** Time ranges the dial cycles through, in order. */
export const TIME_RANGES: readonly TimeRange[] = ["1h", "6h", "24h", "7d"];

export const DEFAULT_TIME_RANGE: TimeRange = "1h";

export type Theme = "dark" | "light";

export function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === "string" && (TIME_RANGES as readonly string[]).includes(value);
}

/** The time range `step` positions after `current` (negative steps go back); wraps around. */
export function nextTimeRange(current: TimeRange | undefined, step = 1): TimeRange {
  const n = TIME_RANGES.length;
  const index = current ? TIME_RANGES.indexOf(current) : -1;
  if (index < 0) {
    return DEFAULT_TIME_RANGE;
  }
  return TIME_RANGES[(((index + step) % n) + n) % n];
}

/** Removes whitespace and trailing slashes so paths can be appended. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export type DashboardInfo = {
  uid: string;
  title: string;
  /** URL path slug, e.g. "power-overview" from "/d/abc123/power-overview". */
  slug: string;
  folder?: string;
};

/** Slug of a dashboard from its `url` in `/api/search` results ("/d/{uid}/{slug}"). */
export function slugFromUrl(url: string | undefined): string {
  const match = url?.match(/\/d\/[^/?#]+\/([^/?#]+)/);
  return match ? match[1] : "d";
}

type RawSearchHit = {
  uid?: string;
  title?: string;
  url?: string;
  type?: string;
  folderTitle?: string;
};

/** Dashboards from `/api/search?type=dash-db`, sorted by folder and title. */
export function parseDashboards(hits: RawSearchHit[]): DashboardInfo[] {
  return hits
    .filter((h): h is RawSearchHit & { uid: string } => typeof h.uid === "string" && h.uid !== "" && h.type !== "dash-folder")
    .map((h) => ({ uid: h.uid, title: h.title || h.uid, slug: slugFromUrl(h.url), folder: h.folderTitle || undefined }))
    .sort((a, b) => (a.folder ?? "").localeCompare(b.folder ?? "") || a.title.localeCompare(b.title));
}

export type PanelInfo = {
  id: number;
  title: string;
  type: string;
  /** Title of the row the panel belongs to, if any. */
  row?: string;
};

type RawPanel = {
  id?: number | string;
  type?: string;
  title?: string;
  collapsed?: boolean;
  panels?: RawPanel[];
};

export type RawDashboard = {
  panels?: RawPanel[];
  /** Legacy (pre schema 16) dashboards keep their panels in rows. */
  rows?: { title?: string; panels?: RawPanel[] }[];
};

/**
 * All renderable panels of a dashboard in display order. Rows are not panels
 * themselves and are skipped, but the panels of collapsed rows (nested in the
 * row) are included.
 */
export function flattenPanels(dashboard: RawDashboard): PanelInfo[] {
  const result: PanelInfo[] = [];

  const add = (panel: RawPanel, row: string | undefined) => {
    const id = Number(panel.id);
    if (!Number.isInteger(id)) {
      return;
    }
    result.push({ id, title: panel.title?.trim() || `Panel ${id}`, type: panel.type ?? "unknown", row });
  };

  const walk = (panels: RawPanel[] | undefined, row: string | undefined) => {
    let currentRow = row;
    for (const panel of panels ?? []) {
      if (panel.type === "row") {
        currentRow = panel.title?.trim() || undefined;
        walk(panel.panels, currentRow);
      } else {
        add(panel, currentRow);
      }
    }
  };

  walk(dashboard.panels, undefined);
  for (const row of dashboard.rows ?? []) {
    walk(row.panels, row.title?.trim() || undefined);
  }
  return result;
}

export type RenderOptions = {
  baseUrl: string;
  uid: string;
  slug?: string;
  panelId: number | string;
  width: number;
  height: number;
  range: TimeRange;
  theme?: Theme;
  orgId?: number;
  tz?: string;
  scale?: number;
};

/** URL of the render API for one panel (`/render/d-solo/{uid}/{slug}?...`). */
export function renderUrl(o: RenderOptions): string {
  const params = new URLSearchParams({
    orgId: String(o.orgId ?? 1),
    panelId: String(o.panelId),
    width: String(o.width),
    height: String(o.height),
    theme: o.theme ?? "dark",
    from: `now-${o.range}`,
    to: "now",
    tz: o.tz ?? "Europe/Berlin",
    scale: String(o.scale ?? 1),
  });
  return `${normalizeBaseUrl(o.baseUrl)}/render/d-solo/${encodeURIComponent(o.uid)}/${encodeURIComponent(o.slug || "d")}?${params}`;
}

export type DashboardLinkOptions = {
  baseUrl: string;
  uid: string;
  slug?: string;
  panelId?: number | string;
  range?: TimeRange;
  orgId?: number;
};

/** URL of the dashboard in the browser, with the panel opened in view mode. */
export function dashboardUrl(o: DashboardLinkOptions): string {
  const params = new URLSearchParams({ orgId: String(o.orgId ?? 1) });
  if (o.panelId !== undefined && o.panelId !== "") {
    params.set("viewPanel", String(o.panelId));
  }
  if (o.range) {
    params.set("from", `now-${o.range}`);
    params.set("to", "now");
  }
  return `${normalizeBaseUrl(o.baseUrl)}/d/${encodeURIComponent(o.uid)}/${encodeURIComponent(o.slug || "d")}?${params}`;
}

export type RenderFailure = { status?: number; error: string };

/** Two short lines for the error placeholder on a key or touch strip. */
export function failureText(f: RenderFailure): { title: string; detail: string } {
  const s = f.status;
  if (s !== undefined) {
    if (s === 401 || s === 403) {
      return { title: `HTTP ${s}`, detail: "check token" };
    }
    if (s === 404) {
      return { title: "HTTP 404", detail: "panel not found" };
    }
    if (s >= 300 && s < 400) {
      return { title: `HTTP ${s}`, detail: "check URL" };
    }
    if (s >= 500) {
      return { title: `HTTP ${s}`, detail: "renderer error" };
    }
    return { title: `HTTP ${s}`, detail: "render failed" };
  }
  if (/timeout|timed out|abort/i.test(f.error)) {
    return { title: "Timeout", detail: "render too slow" };
  }
  if (/not an image|empty image/i.test(f.error)) {
    return { title: "No image", detail: "renderer missing?" };
  }
  return { title: "Offline", detail: "Grafana unreachable" };
}

export type SelectItem = { label: string; value: string };
export type SelectGroup = { label: string; children: SelectItem[] };

/** Groups items by a key for an `sdpi-select`; stays flat when no item has a group. */
function grouped<T>(list: T[], groupOf: (item: T) => string | undefined, itemOf: (item: T) => SelectItem, ungroupedLabel: string): (SelectItem | SelectGroup)[] {
  if (!list.some((item) => groupOf(item))) {
    return list.map(itemOf);
  }
  const groups = new Map<string, SelectItem[]>();
  for (const item of list) {
    const label = groupOf(item) || ungroupedLabel;
    let children = groups.get(label);
    if (!children) {
      children = [];
      groups.set(label, children);
    }
    children.push(itemOf(item));
  }
  return [...groups.entries()].map(([label, children]) => ({ label, children }));
}

/** Dashboard picker items, grouped by folder. */
export function dashboardItems(list: DashboardInfo[]): (SelectItem | SelectGroup)[] {
  return grouped(list, (d) => d.folder, (d) => ({ label: d.title, value: d.uid }), "General");
}

/** Panel picker items, grouped by row. */
export function panelItems(list: PanelInfo[]): (SelectItem | SelectGroup)[] {
  return grouped(list, (p) => p.row, (p) => ({ label: p.title, value: String(p.id) }), "Panels");
}
