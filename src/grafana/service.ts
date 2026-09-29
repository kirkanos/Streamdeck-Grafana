import { EventEmitter } from "node:events";
import {
  type DashboardInfo,
  flattenPanels,
  normalizeBaseUrl,
  type PanelInfo,
  parseDashboards,
  type RawDashboard,
  type RenderFailure,
  type RenderOptions,
  renderUrl,
} from "./model";

export type GrafanaSettings = { url?: string; token?: string };

export type ConnectionState = "unconfigured" | "connecting" | "connected" | "error";

export type RenderResult = { ok: true; png: Buffer } | ({ ok: false } & RenderFailure);

export type VerifyResult = { ok: true; org: string } | { ok: false; error: string };

const API_TIMEOUT_MS = 15_000;
/** The image renderer takes 1 to 3 s per panel, more on a busy host. */
const RENDER_TIMEOUT_MS = 45_000;

/**
 * Talks to one Grafana instance with a service account token: dashboard and
 * panel lists for the settings pages, and the panel renderer for keys and dials.
 *
 * Events:
 *   "settings"  the connection settings changed
 *   "state"     the connection state changed
 */
export class GrafanaService extends EventEmitter<{ settings: []; state: [] }> {
  #settings: GrafanaSettings = {};
  #state: ConnectionState = "unconfigured";
  #error: string | undefined;
  #org: string | undefined;
  #dashboards: DashboardInfo[] | undefined;
  #dashboardsPromise: Promise<DashboardInfo[]> | undefined;

  get settings(): GrafanaSettings {
    return this.#settings;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get error(): string | undefined {
    return this.#error;
  }

  /** Name of the organization the token belongs to (after a successful verify). */
  get org(): string | undefined {
    return this.#org;
  }

  get isConfigured(): boolean {
    return Boolean(this.#settings.url && this.#settings.token);
  }

  /** Applies new connection settings; the connection is checked with `verify()`. */
  configure(settings: GrafanaSettings): void {
    const url = settings.url ? normalizeBaseUrl(settings.url) : undefined;
    const token = settings.token?.trim() || undefined;
    if (url === this.#settings.url && token === this.#settings.token) {
      return;
    }
    this.#settings = { url, token };
    this.#dashboards = undefined;
    this.#dashboardsPromise = undefined;
    this.#org = undefined;
    this.#setState(this.isConfigured ? "connecting" : "unconfigured");
    this.emit("settings");
  }

  /** Checks URL and token against `/api/org` and updates the connection state. */
  async verify(): Promise<VerifyResult> {
    if (!this.isConfigured) {
      this.#setState("unconfigured");
      return { ok: false, error: "URL and token are not set" };
    }
    this.#setState("connecting");
    const settings = this.#settings;
    try {
      const res = await this.#fetch("/api/org", API_TIMEOUT_MS);
      if (settings !== this.#settings) {
        return { ok: false, error: "Settings changed" };
      }
      if (!res.ok) {
        const error = res.status === 401 || res.status === 403 ? `HTTP ${res.status}: token rejected` : `HTTP ${res.status}`;
        this.#setState("error", error);
        return { ok: false, error };
      }
      const body = (await res.json()) as { name?: string };
      this.#org = body.name || "Grafana";
      this.#setState("connected");
      return { ok: true, org: this.#org };
    } catch (err) {
      const error = `Cannot reach ${settings.url}: ${errorMessage(err)}`;
      if (settings === this.#settings) {
        this.#setState("error", error);
      }
      return { ok: false, error };
    }
  }

  /** All dashboards (`/api/search?type=dash-db`), cached until `force` or new settings. */
  dashboards(force = false): Promise<DashboardInfo[]> {
    if (!force && this.#dashboards) {
      return Promise.resolve(this.#dashboards);
    }
    if (!force && this.#dashboardsPromise) {
      return this.#dashboardsPromise;
    }
    const settings = this.#settings;
    const promise = (async () => {
      const res = await this.#fetch("/api/search?type=dash-db&limit=5000", API_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const list = parseDashboards((await res.json()) as Parameters<typeof parseDashboards>[0]);
      if (settings === this.#settings) {
        this.#dashboards = list;
      }
      return list;
    })();
    this.#dashboardsPromise = promise.finally(() => {
      if (this.#dashboardsPromise === promise) {
        this.#dashboardsPromise = undefined;
      }
    });
    return promise;
  }

  /** Cached dashboard, if the list was loaded. */
  dashboard(uid: string | undefined): DashboardInfo | undefined {
    return uid ? this.#dashboards?.find((d) => d.uid === uid) : undefined;
  }

  /** URL slug of a dashboard; loads the dashboard list once if needed. */
  async slugFor(uid: string): Promise<string | undefined> {
    if (!this.#dashboards) {
      try {
        await this.dashboards();
      } catch {
        return undefined;
      }
    }
    return this.dashboard(uid)?.slug;
  }

  /** Renderable panels of a dashboard (`/api/dashboards/uid/{uid}`). */
  async panels(uid: string): Promise<PanelInfo[]> {
    const res = await this.#fetch(`/api/dashboards/uid/${encodeURIComponent(uid)}`, API_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { dashboard?: RawDashboard; meta?: { slug?: string } };
    const cached = this.dashboard(uid);
    if (cached && body.meta?.slug) {
      cached.slug = body.meta.slug;
    }
    return flattenPanels(body.dashboard ?? {});
  }

  /** Renders one panel to PNG through the image renderer. */
  async render(options: Omit<RenderOptions, "baseUrl">): Promise<RenderResult> {
    if (!this.isConfigured) {
      return { ok: false, error: "not configured" };
    }
    const url = renderUrl({ ...options, baseUrl: this.#settings.url! });
    try {
      const res = await this.#fetch(url, RENDER_TIMEOUT_MS, "image/png");
      if (!res.ok) {
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      }
      // A redirect to the login page or an HTML error page is not a panel image.
      if (!(res.headers.get("content-type") ?? "").startsWith("image/")) {
        return { ok: false, error: "not an image" };
      }
      const png = Buffer.from(await res.arrayBuffer());
      if (png.length === 0) {
        return { ok: false, error: "empty image" };
      }
      return { ok: true, png };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  #fetch(pathOrUrl: string, timeoutMs: number, accept = "application/json"): Promise<Response> {
    const { url, token } = this.#settings;
    if (!url || !token) {
      return Promise.reject(new Error("not configured"));
    }
    const target = pathOrUrl.startsWith("http") ? pathOrUrl : `${url}${pathOrUrl}`;
    return fetch(target, {
      headers: { Authorization: `Bearer ${token}`, Accept: accept },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  #setState(state: ConnectionState, error?: string): void {
    if (state === this.#state && error === this.#error) {
      return;
    }
    this.#state = state;
    this.#error = error;
    this.emit("state");
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Node wraps network errors: "fetch failed" with the real reason in cause.
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return cause.message;
    }
    return err.message;
  }
  return String(err);
}

export const grafana = new GrafanaService();
