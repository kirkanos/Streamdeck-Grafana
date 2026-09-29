import { background, svg, text, toDataUrl } from "./svg";
import { THEME } from "./theme";

/** Key images are drawn at 144×144 and scaled by Stream Deck. */
const S = 144;

/** A rendered panel PNG as the key image. */
export function pngImage(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Neutral key with two lines of text, e.g. "Select / a dashboard". */
export function messageKey(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      S,
      S,
      background("bg", THEME.surface, THEME.base, S, S) +
        `<rect x="3" y="3" width="${S - 6}" height="${S - 6}" rx="14" fill="none" stroke="${THEME.muted}" stroke-width="2"/>` +
        text(title, { x: S / 2, y: 68, size: 22, weight: 800 }) +
        text(subtitle, { x: S / 2, y: 92, size: 15, weight: 600, fill: THEME.subtle }),
    ),
  );
}

/** Warning triangle with an exclamation mark, centered at (cx, cy). */
export function warningIcon(cx: number, cy: number, size: number, color: string): string {
  const h = size;
  const w = size * 1.12;
  const top = cy - h / 2;
  return (
    `<path d="M ${cx} ${top} L ${cx + w / 2} ${top + h} L ${cx - w / 2} ${top + h} Z" fill="none" stroke="${color}" stroke-width="${Math.max(2, size / 8)}" stroke-linejoin="round"/>` +
    `<line x1="${cx}" y1="${top + h * 0.36}" x2="${cx}" y2="${top + h * 0.68}" stroke="${color}" stroke-width="${Math.max(2, size / 8)}" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${top + h * 0.83}" r="${Math.max(1.5, size / 14)}" fill="${color}"/>`
  );
}

/** Gray key with a warning icon, shown when a panel render fails (e.g. "HTTP 401 / check token"). */
export function errorKey(title: string, detail: string): string {
  return toDataUrl(
    svg(
      S,
      S,
      background("bg", THEME.muted, THEME.base, S, S) +
        warningIcon(S / 2, 46, 44, THEME.warn) +
        text(title, { x: S / 2, y: 98, size: 22, weight: 800 }) +
        text(detail, { x: S / 2, y: 120, size: 14, weight: 600, fill: THEME.subtle }),
    ),
  );
}
