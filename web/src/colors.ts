// Colour scales of the charts, the heatmap and the map (light theme: paler = less, darker = more). Both scales are colour-blind safe (checked
// against deuteranopia, protanopia and tritanopia) and every value is also shown as a number.
// The quick view's marked days take their colours from styles.css (--lv*, --vs*).

// Counts: yellow → orange → red, the same family as the quick calendar's bricks (--lv1…--lv4), darker = more.
export const COUNTS_SCALE = ['#fff3c4', '#ffe08a', '#ffc65c', '#ffa23f', '#f2682a', '#d63d1f', '#b5121b', '#7a0c14'];

// vs Average: purple (below) <-> neutral <-> orange (above). No red/green.
export const ANOMALY_SCALE = ['#4b2991', '#7b5cb8', '#b4a4d8', '#efeff1', '#f7c58a', '#ec8b2e', '#b35806'];

// Satellites in the charts: Okabe–Ito based, readable with colour-blindness; every series is also named.
export const SAT_COLOR = {
  modis_terra: '#56B4E9',
  modis_aqua: '#0072B2',
  viirs_snpp: '#CC79A7',
  viirs_noaa20: '#7b6fd0',
} as const;

export const NO_FIRE = '#f5f5f7';
export const NEUTRAL_CELL = '#ffffff';
/** the reference year's line in the charts, and the one accent of the page */
export const EMBER = '#d9480f';

// Map points: fire strength (FRP, MW), same family as COUNTS_SCALE.
export const FRP_STOPS: [number, string][] = [
  [0, '#f9cb35'],
  [10, '#f98e09'],
  [50, '#e45a31'],
  [150, '#bc3754'],
];

/**
 * Position on the diverging scale. Uses the ratio to the average on a log2
 * axis, so "half" and "double" sit at the same distance from "normal".
 * Display only: the % itself comes from the API.
 */
export function anomalyPosition(vsAvgPct: number | null): number | null {
  if (vsAvgPct === null) return null;
  const ratio = Math.max(0.0625, 1 + vsAvgPct / 100);
  return Math.max(-2, Math.min(2, Math.log2(ratio)));
}

export const ANOMALY_TICKS: { pos: number; label: string }[] = [
  { pos: -2, label: '▼ ¼×' },
  { pos: -1, label: '▼ ½×' },
  { pos: 0, label: '● avg' },
  { pos: 1, label: '▲ 2×' },
  { pos: 2, label: '▲ 4×+' },
];

// Next-week fire chance (the "Fire cells" view): the calendar's own yellow → orange → red (--lv1…--lv4 in styles.css),
// darker = more likely. Colour-blind safe like the bricks; the legend gives every step's value.
export const CHANCE_STOPS: [number, string][] = [
  [0, '#ffe08a'],
  [0.1, '#ffb347'],
  [0.25, '#f2682a'],
  [0.5, '#b5121b'],
];
