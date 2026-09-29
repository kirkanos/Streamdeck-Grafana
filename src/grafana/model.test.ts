import { describe, expect, it } from "vitest";
import {
  dashboardItems,
  dashboardUrl,
  failureText,
  flattenPanels,
  isTimeRange,
  nextTimeRange,
  normalizeBaseUrl,
  panelItems,
  parseDashboards,
  renderUrl,
  slugFromUrl,
} from "./model";

describe("renderUrl", () => {
  const url = renderUrl({
    baseUrl: "https://grafana.example.com/",
    uid: "abc123",
    slug: "power-overview",
    panelId: 4,
    width: 144,
    height: 144,
    range: "1h",
  });

  it("targets the solo panel renderer of the dashboard", () => {
    expect(url.startsWith("https://grafana.example.com/render/d-solo/abc123/power-overview?")).toBe(true);
  });

  it("passes size, time range, theme and time zone as query parameters", () => {
    const params = new URL(url).searchParams;
    expect(Object.fromEntries(params)).toEqual({
      orgId: "1",
      panelId: "4",
      width: "144",
      height: "144",
      theme: "dark",
      from: "now-1h",
      to: "now",
      tz: "Europe/Berlin",
      scale: "1",
    });
  });

  it("uses the given theme, range, org, time zone and scale", () => {
    const params = new URL(
      renderUrl({ baseUrl: "http://g", uid: "u", panelId: "7", width: 200, height: 100, range: "7d", theme: "light", orgId: 2, tz: "UTC", scale: 2 }),
    ).searchParams;
    expect(params.get("theme")).toBe("light");
    expect(params.get("from")).toBe("now-7d");
    expect(params.get("orgId")).toBe("2");
    expect(params.get("tz")).toBe("UTC");
    expect(params.get("scale")).toBe("2");
    expect(params.get("width")).toBe("200");
    expect(params.get("height")).toBe("100");
  });

  it("falls back to a placeholder slug and escapes the uid", () => {
    expect(renderUrl({ baseUrl: "http://g", uid: "a b", panelId: 1, width: 1, height: 1, range: "6h" })).toContain("/render/d-solo/a%20b/d?");
  });
});

describe("dashboardUrl", () => {
  it("opens the panel in view mode with the same time range", () => {
    expect(dashboardUrl({ baseUrl: "https://g.example.com//", uid: "abc", slug: "power", panelId: 4, range: "24h" })).toBe(
      "https://g.example.com/d/abc/power?orgId=1&viewPanel=4&from=now-24h&to=now",
    );
  });

  it("links the whole dashboard without a panel", () => {
    expect(dashboardUrl({ baseUrl: "https://g", uid: "abc" })).toBe("https://g/d/abc/d?orgId=1");
  });
});

describe("normalizeBaseUrl / slugFromUrl", () => {
  it("strips whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://g.example.com/// ")).toBe("https://g.example.com");
  });

  it("takes the slug from a search result url", () => {
    expect(slugFromUrl("/d/abc123/power-overview")).toBe("power-overview");
    expect(slugFromUrl("/d/abc123/power-overview?orgId=1")).toBe("power-overview");
    expect(slugFromUrl(undefined)).toBe("d");
    expect(slugFromUrl("/dashboards/f/xyz/folder")).toBe("d");
  });
});

describe("parseDashboards", () => {
  it("keeps dashboards with a uid, sorted by folder and title", () => {
    const list = parseDashboards([
      { uid: "b", title: "Zeta", url: "/d/b/zeta", type: "dash-db", folderTitle: "Home" },
      { uid: "a", title: "Alpha", url: "/d/a/alpha", type: "dash-db" },
      { uid: "f", title: "Folder", type: "dash-folder" },
      { title: "no uid" },
      { uid: "c", title: "Beta", url: "/d/c/beta", type: "dash-db", folderTitle: "Home" },
    ]);
    expect(list).toEqual([
      { uid: "a", title: "Alpha", slug: "alpha", folder: undefined },
      { uid: "c", title: "Beta", slug: "beta", folder: "Home" },
      { uid: "b", title: "Zeta", slug: "zeta", folder: "Home" },
    ]);
  });
});

describe("flattenPanels", () => {
  it("lists panels in order and skips rows, including panels of collapsed rows", () => {
    const panels = flattenPanels({
      panels: [
        { id: 1, type: "stat", title: "Power" },
        { id: 2, type: "row", title: "Temperatures", collapsed: false },
        { id: 3, type: "gauge", title: "Living room" },
        { id: 4, type: "row", title: "Network", collapsed: true, panels: [{ id: 5, type: "timeseries", title: "Traefik requests" }] },
        { id: 6, type: "text", title: "" },
      ],
    });
    expect(panels).toEqual([
      { id: 1, title: "Power", type: "stat", row: undefined },
      { id: 3, title: "Living room", type: "gauge", row: "Temperatures" },
      { id: 5, title: "Traefik requests", type: "timeseries", row: "Network" },
      { id: 6, title: "Panel 6", type: "text", row: "Network" },
    ]);
  });

  it("reads legacy dashboards with rows", () => {
    const panels = flattenPanels({ rows: [{ title: "Row A", panels: [{ id: 10, type: "graph", title: "Old graph" }] }] });
    expect(panels).toEqual([{ id: 10, title: "Old graph", type: "graph", row: "Row A" }]);
  });

  it("ignores panels without a numeric id and empty dashboards", () => {
    expect(flattenPanels({ panels: [{ type: "stat", title: "no id" }, { id: "x", type: "stat" }] })).toEqual([]);
    expect(flattenPanels({})).toEqual([]);
  });
});

describe("time ranges", () => {
  it("cycles forward and backward with wrap-around", () => {
    expect(nextTimeRange("1h")).toBe("6h");
    expect(nextTimeRange("7d")).toBe("1h");
    expect(nextTimeRange("1h", -1)).toBe("7d");
    expect(nextTimeRange("24h", -1)).toBe("6h");
    expect(nextTimeRange("6h", 2)).toBe("7d");
  });

  it("starts at the default range when nothing is set", () => {
    expect(nextTimeRange(undefined)).toBe("1h");
    expect(isTimeRange("24h")).toBe(true);
    expect(isTimeRange("2d")).toBe(false);
  });
});

describe("failureText", () => {
  it("names the status code and a hint", () => {
    expect(failureText({ status: 401, error: "Unauthorized" })).toEqual({ title: "HTTP 401", detail: "check token" });
    expect(failureText({ status: 404, error: "" })).toEqual({ title: "HTTP 404", detail: "panel not found" });
    expect(failureText({ status: 502, error: "" })).toEqual({ title: "HTTP 502", detail: "renderer error" });
    expect(failureText({ status: 400, error: "" })).toEqual({ title: "HTTP 400", detail: "render failed" });
    expect(failureText({ status: 302, error: "" })).toEqual({ title: "HTTP 302", detail: "check URL" });
  });

  it("distinguishes timeouts from unreachable servers", () => {
    expect(failureText({ error: "The operation was aborted due to timeout" }).title).toBe("Timeout");
    expect(failureText({ error: "fetch failed" }).title).toBe("Offline");
    expect(failureText({ error: "not an image" }).title).toBe("No image");
  });
});

describe("select items", () => {
  it("lists dashboards flat when there are no folders", () => {
    expect(dashboardItems([{ uid: "a", title: "Alpha", slug: "alpha" }])).toEqual([{ label: "Alpha", value: "a" }]);
  });

  it("groups dashboards by folder, ungrouped ones under General", () => {
    expect(
      dashboardItems([
        { uid: "a", title: "Alpha", slug: "alpha" },
        { uid: "b", title: "Beta", slug: "beta", folder: "Home" },
      ]),
    ).toEqual([
      { label: "General", children: [{ label: "Alpha", value: "a" }] },
      { label: "Home", children: [{ label: "Beta", value: "b" }] },
    ]);
  });

  it("groups panels by row with string ids", () => {
    expect(
      panelItems([
        { id: 1, title: "Power", type: "stat" },
        { id: 3, title: "Living room", type: "gauge", row: "Temperatures" },
      ]),
    ).toEqual([
      { label: "Panels", children: [{ label: "Power", value: "1" }] },
      { label: "Temperatures", children: [{ label: "Living room", value: "3" }] },
    ]);
    expect(panelItems([{ id: 1, title: "Power", type: "stat" }])).toEqual([{ label: "Power", value: "1" }]);
  });
});
