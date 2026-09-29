import { describe, expect, it } from "vitest";
import { panelIdOf, refreshIntervalMs, themeOf, timeRangeOf, unavailableReason } from "./settings";

describe("panel settings", () => {
  it("parses the refresh interval with default and lower bound", () => {
    expect(refreshIntervalMs({})).toBe(60_000);
    expect(refreshIntervalMs({ refreshSeconds: "30" })).toBe(30_000);
    expect(refreshIntervalMs({ refreshSeconds: 300 })).toBe(300_000);
    expect(refreshIntervalMs({ refreshSeconds: "abc" })).toBe(60_000);
    expect(refreshIntervalMs({ refreshSeconds: 1 })).toBe(10_000);
  });

  it("falls back to the default time range and theme", () => {
    expect(timeRangeOf({ timeRange: "24h" })).toBe("24h");
    expect(timeRangeOf({ timeRange: "2d" })).toBe("1h");
    expect(timeRangeOf({})).toBe("1h");
    expect(themeOf({ theme: "light" })).toBe("light");
    expect(themeOf({ theme: "blue" })).toBe("dark");
  });

  it("normalizes the panel id", () => {
    expect(panelIdOf({ panelId: 4 })).toBe("4");
    expect(panelIdOf({ panelId: " 12 " })).toBe("12");
    expect(panelIdOf({ panelId: "" })).toBeUndefined();
    expect(panelIdOf({})).toBeUndefined();
  });

  it("explains why a key cannot render", () => {
    expect(unavailableReason({ dashboardUid: "a", panelId: 1 }, false)).toEqual({ title: "Set up", subtitle: "Grafana in settings" });
    expect(unavailableReason({}, true)).toEqual({ title: "Select", subtitle: "a dashboard" });
    expect(unavailableReason({ dashboardUid: "a" }, true)).toEqual({ title: "Select", subtitle: "a panel" });
    expect(unavailableReason({ dashboardUid: "a", panelId: "3" }, true)).toBeUndefined();
  });
});
