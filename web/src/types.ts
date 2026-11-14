// Shapes from docs/api-contract.md (v0.1). Keep in sync with the contract.
import type { Polygon, MultiPolygon } from 'geojson';

export type AreaGeometry = Polygon | MultiPolygon;
export type SatelliteKey = 'modis_terra' | 'modis_aqua' | 'viirs_snpp' | 'viirs_noaa20';
export type Detected = Record<SatelliteKey, number | null>;

export interface Preset {
  id: string;
  name: string;
  area: Polygon;
}

export interface AnalysisRequest {
  area: AreaGeometry;
  start?: string;
  end?: string;
  ref_date?: string;
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
  average_period: { from: number; to: number };
  yearly: YearItem[];
  cards: Cards;
  next_months: NextMonth[];
  next_months_label: string;
  briefing: string;
  reliability: { median_error_pct: number | null; validated_years: number[]; note: string };
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
