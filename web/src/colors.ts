// Colour scales of the dark panels (heatmap, charts, map). Both scales are colour-blind safe (checked
// against deuteranopia, protanopia and tritanopia) and every value is also shown as a number.
// The quick view's marked days take their colours from styles.css (--lv*, --vs*).

// Counts: "inferno" (sequential, perceptually uniform). Darkest stop dropped
// so low months stay visible on the dark background.
export const COUNTS_SCALE = ['#2a0b4a', '#57106e', '#8a226a', '#bc3754', '#e45a31', '#f98e09', '#f9cb35', '#fcffa4'];

// vs Average: purple (below) <-> neutral <-> orange (above). No red/green.
export const ANOMALY_SCALE = ['#4b2991', '#7b5cb8', '#b4a4d8', '#d9d4e4', '#f7c58a', '#ec8b2e', '#b35806'];

// Satellites in the charts: Okabe–Ito based, readable with colour-blindness; every series is also named.
export const SAT_COLOR = {
  modis_terra: '#56B4E9',
  modis_aqua: '#0072B2',
  viirs_snpp: '#CC79A7',
  viirs_noaa20: '#9b8ce0',
} as const;

export const NO_FIRE = '#1b1f2a';
export const NEUTRAL_CELL = '#262b38';

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
  { pos: -2, label: '¼×' },
  { pos: -1, label: '½×' },
  { pos: 0, label: 'avg' },
  { pos: 1, label: '2×' },
  { pos: 2, label: '4×+' },
];
