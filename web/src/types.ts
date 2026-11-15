// Shapes from docs/api-contract.md (v0.4). Keep in sync with the contract.
// Missing values are null, never 0 (e.g. a satellite that was not in orbit yet).
import type { Polygon, MultiPolygon } from 'geojson';

export type AreaGeometry = Polygon | MultiPolygon;
export type SatelliteKey = 'modis_terra' | 'modis_aqua' | 'viirs_snpp' | 'viirs_noaa20';
// contract v0.3: one satellite per instrument, so no fire is counted twice (the other two keys are gone from the API)
export const SATELLITES: SatelliteKey[] = ['modis_terra', 'viirs_noaa20'];
export const SAT_NAMES: Record<SatelliteKey, string> = {
  modis_terra: 'MODIS Terra',
  modis_aqua: 'MODIS Aqua',
  viirs_snpp: 'VIIRS S-NPP',
  viirs_noaa20: 'VIIRS NOAA-20',
};
export type Detected = Record<SatelliteKey, number | null>;

export interface Preset {
  id: string;
  name: string;
  area: Polygon;
}

export interface Coverage {
  satellite: SatelliteKey;
  from: string;
  to: string | null; // null = still active
}

export interface Status {
  data_updated: string;
  contract_version: string;
  calendar_from: string;
  final_until: string | null;
  coverage: Coverage[];
  /** false while the forecast model loads or if it is missing: hide the forecast panel (contract v0.2) */
  forecast_available?: boolean;
}

export interface AnalysisRequest {
  area: AreaGeometry;
  start?: string;
  end?: string;
  ref_date?: string;
  /** `/api/analysis` only (v0.4): "week" adds calendar_weekly and average_by_week to the answer */
  period?: 'month' | 'week';
}

export interface CalendarItem {
  year: number;
  month: number;
  count: number | null;
  vs_avg_pct: number | null;
  rank: number | null;
  of_years: number | null;
  detected: Detected;
  provisional: boolean;
  uncertain: boolean;
  partial: boolean;
  days_covered: number;
}

export interface MonthAverage {
  month: number;
  mean: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  years?: number;
}

/** One ISO week (Monday → Sunday, UTC). `year` is the ISO year: 29 Dec 2025 is 2026 week 1. Contract v0.4. */
export interface WeekItem {
  year: number;
  week: number;
  start: string;
  end: string;
  count: number | null;
  vs_avg_pct: number | null;
  provisional: boolean;
  uncertain: boolean;
  partial: boolean;
  days_covered: number;
}

export interface WeekAverage {
  week: number;
  mean: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  years: number;
}

export interface NextMonth extends MonthAverage {
  year: number;
}

export interface YearItem {
  year: number;
  count: number | null;
  detected: Detected;
  provisional: boolean;
  complete: boolean;
}

export interface Cards {
  ref_year: number;
  ref_month: number;
  count: number | null;
  detected: Detected;
  estimated_fires: number | null;
  vs_avg_pct: number | null;
  rank: number | null;
  of_years: number | null;
  partial: boolean;
  days_covered: number;
  peak_month: number | null;
  worst_year: number | null;
}

export interface Analysis {
  _mock?: string;
  warning?: string;
  query: { start: string; end: string; ref_date: string; area_km2: number };
  data_updated: string;
  unit: { main: string; raw: string };
  calendar: CalendarItem[];
  average_by_month: MonthAverage[];
  /** null when the reference year has no complete year before it */
  average_period: { from: number; to: number } | null;
  yearly: YearItem[];
  cards: Cards;
  next_months: NextMonth[];
  next_months_label: string;
  briefing: string;
  reliability: { median_error_pct: number | null; validated_years: number[]; note: string };
  /** only when asked with "period": "week" (v0.4) */
  calendar_weekly?: WeekItem[];
  average_by_week?: WeekAverage[];
}

export interface HotspotProps {
  date: string;
  time_utc: string;
  satellite: string;
  confidence: string;
  confidence_raw: string;
  frp: number | null;
  daynight: string;
  provisional: boolean;
}

export interface Hotspots {
  _mock?: string;
  type: 'FeatureCollection';
  total: number;
  returned: number;
  truncated: boolean;
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: HotspotProps;
  }[];
}

export interface UpdateResult {
  status: 'updated' | 'too_soon' | 'failed';
  data_updated: string;
  new_hotspots: number;
  message?: string;
}

// ---------- POST /api/forecast (contract v0.2): the only forecast in the app ----------

export type Intensity = 'low' | 'medium' | 'high';

export interface ForecastRequest {
  area: AreaGeometry;
  ref_date?: string;
  limit?: number;
}

export interface Forecast {
  query: { ref_date: string; area_km2: number };
  data_updated: string;
  based_on: { satellite: SatelliteKey; from: string; to: string };
  period: { from: string; to: string };
  /** always shown next to the numbers */
  label: string;
  cell_size_km: number;
  summary: {
    cells: number;
    expected_cells_with_fire: number | null;
    expected_share_pct: number | null;
    max_probability: number | null;
    intensity_if_fire: Intensity | null;
    recent_detections: number | null;
  };
  briefing: string;
  reliability: { auc: number | null; baseline_auc: number | null; test_years: number[]; note: string };
  total: number;
  returned: number;
  truncated: boolean;
  cells: {
    type: 'FeatureCollection';
    features: {
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: { probability: number; intensity_if_fire: Intensity | null };
    }[];
  };
  notes: string[];
}
