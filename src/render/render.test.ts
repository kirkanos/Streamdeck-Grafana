import { describe, expect, it } from "vitest";
import { DIAL_HEIGHT, DIAL_WIDTH, dialError, dialMessage } from "./dial";
import { errorKey, messageKey, pngImage } from "./keys";
import { escapeXml } from "./svg";

const decode = (dataUrl: string) => {
  expect(dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
  return Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
};

describe("key placeholders", () => {
  it("draws a 144×144 message key with both lines", () => {
    const svg = decode(messageKey("Select", "a dashboard"));
    expect(svg).toContain('width="144" height="144"');
    expect(svg).toContain(">Select<");
    expect(svg).toContain(">a dashboard<");
    expect(svg).not.toContain("<path");
  });

  it("draws the error key with a warning icon and the status code", () => {
    const svg = decode(errorKey("HTTP 401", "check token"));
    expect(svg).toContain(">HTTP 401<");
    expect(svg).toContain(">check token<");
    expect(svg).toContain("<path");
    expect(svg).toContain("<line");
  });

  it("escapes text", () => {
    expect(escapeXml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    const svg = decode(messageKey("R&D", "<prod>"));
    expect(svg).toContain("R&amp;D");
    expect(svg).not.toContain("<prod>");
  });
});

describe("pngImage", () => {
  it("wraps the PNG bytes in a data URL", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const url = pngImage(png);
    expect(url).toBe("data:image/png;base64,iVBORw==");
    expect(Buffer.from(url.split(",")[1], "base64")).toEqual(png);
  });
});

describe("dial placeholders", () => {
  it("draws a 200×100 strip", () => {
    const svg = decode(dialMessage("Turn to select", "1h · 6h · 24h · 7d"));
    expect(svg).toContain(`width="${DIAL_WIDTH}" height="${DIAL_HEIGHT}"`);
    expect(svg).toContain(">Turn to select<");
    expect(svg).toContain("1h · 6h · 24h · 7d");
  });

  it("draws the error strip with icon and detail", () => {
    const svg = decode(dialError("Timeout", "render too slow"));
    expect(svg).toContain(">Timeout<");
    expect(svg).toContain(">render too slow<");
    expect(svg).toContain("<path");
  });
});
