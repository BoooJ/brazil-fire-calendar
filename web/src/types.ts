// Shapes from docs/api-contract.md (v0.1). Keep in sync with the contract.

export type SatelliteKey = 'modis_terra' | 'modis_aqua' | 'viirs_snpp' | 'viirs_noaa20';
export const SATELLITES: SatelliteKey[] = ['modis_terra', 'modis_aqua', 'viirs_snpp', 'viirs_noaa20'];
export const SATELLITE_LABEL: Record<SatelliteKey, string> = {
  modis_terra: 'MODIS Terra',
  modis_aqua: 'MODIS Aqua',
  viirs_snpp: 'VIIRS S-NPP',
  viirs_noaa20: 'VIIRS NOAA-20',
};

export type Detected = Record<SatelliteKey, number | null>;

export interface Polygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}
export interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}
export type Area = Polygon | MultiPolygon;

export interface Preset {
  id: string;
  name: string;
  area: Area;
}

export interface Coverage {
  satellite: SatelliteKey;
  from: string;
  to: string | null;
}

export interface Status {
  data_updated: string;
  contract_version: string;
  calendar_from: string;
  final_until: string;
  coverage: Coverage[];
}

export interface CalendarCell {
  year: number;
  month: number;
  count: number;
  vs_avg_pct: number | null;
  rank: number;
  of_years: number;
  detected: Detected;
  provisional: boolean;
  uncertain: boolean;
  partial: boolean;
  days_covered: number;
}

export interface MonthStats {
  month: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  years: number;
}

export interface YearlyRow {
  year: number;
  count: number;
  detected: Detected;
  provisional: boolean;
  complete: boolean;
}

export interface Cards {
  ref_year: number;
  ref_month: number;
  count: number;
  detected: Detected;
  estimated_fires: number;
  vs_avg_pct: number | null;
  rank: number;
  of_years: number;
  partial: boolean;
  days_covered: number;
  peak_month: number;
  worst_year: number;
}

export interface NextMonth {
  year: number;
  month: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
}

export interface Analysis {
  query: { start: string; end: string; ref_date: string; area_km2: number };
  data_updated: string;
  unit: { main: string; raw: string };
  calendar: CalendarCell[];
  average_by_month: MonthStats[];
  average_period: { from: number; to: number };
  yearly: YearlyRow[];
  cards: Cards;
  next_months: NextMonth[];
  next_months_label: string;
  briefing: string;
  reliability: { median_error_pct: number; validated_years: number[]; note: string };
  warning?: string;
  _mock?: string;
}

export interface HotspotProps {
  date: string;
  time_utc: string;
  satellite: SatelliteKey;
  confidence: 'low' | 'nominal' | 'high';
  confidence_raw: string;
  frp: number;
  daynight: 'D' | 'N';
  provisional: boolean;
}

export interface Hotspots {
  type: 'FeatureCollection';
  total: number;
  returned: number;
  truncated: boolean;
  features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: HotspotProps }[];
  _mock?: string;
}

export interface Query {
  area: Area;
  start: string;
  end: string;
  ref_date: string;
}

export interface UpdateResult {
  status: 'updated' | 'too_soon' | 'failed';
  data_updated: string;
  new_hotspots: number;
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
