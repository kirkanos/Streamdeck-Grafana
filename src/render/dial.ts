import { warningIcon } from "./keys";
import { background, svg, text, toDataUrl } from "./svg";
import { THEME } from "./theme";

/** Touch strip segment of one dial (Stream Deck + / + XL). */
export const DIAL_WIDTH = 200;
export const DIAL_HEIGHT = 100;

/** Neutral strip with two lines of text, e.g. "Select / a panel in the dial settings". */
export function dialMessage(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      DIAL_WIDTH,
      DIAL_HEIGHT,
      background("bg", THEME.surface, THEME.base, DIAL_WIDTH, DIAL_HEIGHT) +
        text(title, { x: 12, y: 44, size: 20, weight: 800, anchor: "start" }) +
        text(subtitle, { x: 12, y: 70, size: 14, weight: 600, fill: THEME.subtle, anchor: "start" }),
    ),
  );
}

/** Gray strip with a warning icon, shown when a panel render fails. */
export function dialError(title: string, detail: string): string {
  return toDataUrl(
    svg(
      DIAL_WIDTH,
      DIAL_HEIGHT,
      background("bg", THEME.muted, THEME.base, DIAL_WIDTH, DIAL_HEIGHT) +
        warningIcon(32, 50, 36, THEME.warn) +
        text(title, { x: 64, y: 46, size: 20, weight: 800, anchor: "start" }) +
        text(detail, { x: 64, y: 70, size: 14, weight: 600, fill: THEME.subtle, anchor: "start" }),
    ),
  );
}
