// The ONLY module that knows where data comes from.
// VITE_API_BASE_URL empty -> fake files in web/mocks/. Otherwise -> the real API.
import type { Analysis, AnalysisRequest, AreaGeometry, Hotspots, Preset } from './types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
export const usingMocks = BASE === '';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function http<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the data server. Check your connection and try again.');
  }
  if (!res.ok) {
    let code = 'SERVER_ERROR';
    let message = `The data server answered with an error (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error?.code) code = j.error.code;
      if (j?.error?.message) message = j.error.message;
    } catch {
      /* keep defaults */
    }
    throw new ApiError(code, message, res.status);
  }
  return (await res.json()) as T;
}

// A short pause so loading states are visible while we build against mocks.
const pause = () => new Promise((r) => setTimeout(r, 350));

export async function getPresets(): Promise<Preset[]> {
  if (usingMocks) {
    const m = await import('../mocks/presets.json');
    return m.default.presets as unknown as Preset[];
  }
  return (await http<{ presets: Preset[] }>('/api/presets')).presets;
}

export async function getAnalysis(req: AnalysisRequest): Promise<Analysis> {
  if (usingMocks) {
    await pause();
    const m =
      req.ref_date === '2020-09-14'
        ? await import('../mocks/analysis.pantanal.ref-2020-09-14.json')
        : await import('../mocks/analysis.pantanal.json');
    return m.default as unknown as Analysis;
  }
  return http<Analysis>('/api/analysis', req);
}

export async function getHotspots(req: {
  area: AreaGeometry;
  year: number;
  month: number;
  limit?: number;
}): Promise<Hotspots> {
  if (usingMocks) {
    await pause();
    if (req.year !== 2020 || req.month !== 9) {
      throw new ApiError('MOCK_ONLY', 'Demo data has map points only for September 2020.');
    }
    const m = await import('../mocks/hotspots.pantanal.2020-09.geojson?raw');
    return JSON.parse(m.default) as Hotspots;
  }
  return http<Hotspots>('/api/hotspots', req);
}
