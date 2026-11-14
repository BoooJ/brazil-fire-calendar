import { forwardRef, useMemo } from 'react';
import type * as echarts from 'echarts';
import { EChart, type EChartHandle } from './EChart';
import type { CalendarCell, MonthStats, SatelliteKey, YearlyRow } from '../types';
import { MONTHS_SHORT, SATELLITES, SATELLITE_LABEL } from '../types';
import { fmt } from '../format';

// Okabe–Ito based, readable with colour-blindness; every series is also named in the legend.
export const SAT_COLOR: Record<SatelliteKey, string> = {
  modis_terra: '#56B4E9',
  modis_aqua: '#0072B2',
  viirs_snpp: '#CC79A7',
  viirs_noaa20: '#9b8ce0',
};

const axisText = { color: '#9aa1b0', fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: 11 };
const split = { lineStyle: { color: '#222736' } };
const tooltipBase: echarts.TooltipComponentOption = {
  trigger: 'axis',
  backgroundColor: 'rgba(16,19,27,0.97)',
  borderColor: '#3a4152',
  textStyle: { color: '#ece9e2', fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: 12 },
};
const legendBase: echarts.LegendComponentOption = { top: 0, textStyle: { color: '#c9cdd6', fontFamily: 'Space Grotesk, system-ui, sans-serif' }, itemWidth: 14, itemHeight: 8 };

export const TypicalYearChart = forwardRef<EChartHandle, { average: MonthStats[]; calendar: CalendarCell[]; refYear: number; period: string }>(
  function TypicalYearChart({ average, calendar, refYear, period }, ref) {
    const option = useMemo<echarts.EChartsOption>(() => {
      const refCells = MONTHS_SHORT.map((_, i) => calendar.find((c) => c.year === refYear && c.month === i + 1) ?? null);
      return {
        animationDuration: 500,
        tooltip: {
          ...tooltipBase,
          formatter: (ps: any) => {
            const i = ps[0].dataIndex;
            const a = average[i];
            const c = refCells[i];
            return `<b>${MONTHS_SHORT[i]}</b><br/>Usual range ${fmt(a.p10)}–${fmt(a.p90)}<br/>Median ${fmt(a.median)} · mean ${fmt(a.mean)}` +
              (c ? `<br/><b style="color:#f9cb35">${refYear}: ${fmt(c.count)}</b>${c.partial ? ` (first ${c.days_covered} days)` : ''}` : '');
          },
        },
        legend: { ...legendBase, data: [`Usual range (p10–p90, ${period})`, 'Median', String(refYear)] },
        grid: { top: 34, left: 44, right: 12, bottom: 24 },
        xAxis: { type: 'category', data: MONTHS_SHORT, axisLabel: axisText, axisLine: { lineStyle: { color: '#3a4152' } }, boundaryGap: false },
        yAxis: { type: 'value', axisLabel: axisText, splitLine: split, name: 'fire-days', nameTextStyle: axisText },
        series: [
          { name: 'p10', type: 'line', data: average.map((a) => a.p10), stack: 'band', lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
          {
            name: `Usual range (p10–p90, ${period})`, type: 'line', data: average.map((a) => a.p90 - a.p10), stack: 'band',
            lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: 'rgba(180,164,216,0.28)' }, itemStyle: { color: '#b4a4d8' },
          },
          { name: 'Median', type: 'line', data: average.map((a) => a.median), symbol: 'none', lineStyle: { color: '#b4a4d8', width: 2, type: 'dashed' }, itemStyle: { color: '#b4a4d8' } },
          {
            name: String(refYear), type: 'line', data: refCells.map((c) => (c ? c.count : null)), connectNulls: false,
            lineStyle: { color: '#f9cb35', width: 3 }, itemStyle: { color: '#f9cb35' }, symbolSize: 7,
          },
        ],
      };
    }, [average, calendar, refYear, period]);
    return <EChart ref={ref} option={option} height={280} ariaLabel={`Typical year: usual monthly range compared with ${refYear}`} />;
  },
);

export const YearlyChart = forwardRef<EChartHandle, { yearly: YearlyRow[]; unitMain: string }>(function YearlyChart({ yearly, unitMain }, ref) {
  const option = useMemo<echarts.EChartsOption>(() => ({
    animationDuration: 500,
    tooltip: {
      ...tooltipBase,
      formatter: (ps: any) => {
        const r = yearly[ps[0].dataIndex];
        const raw = SATELLITES.map((s) => (r.detected[s] === null ? '' : `${SATELLITE_LABEL[s]}: ${fmt(r.detected[s])}<br/>`)).join('');
        return `<b>${r.year}</b>${r.complete ? '' : ' <i>(not finished)</i>'}<br/><b style="color:#f9cb35">Corrected: ${fmt(r.count)}</b> ${unitMain}<br/><span style="opacity:.8">Raw hotspots:</span><br/>${raw}`;
      },
    },
    legend: { ...legendBase, data: [...SATELLITES.map((s) => SATELLITE_LABEL[s]), 'Corrected (harmonized)'] },
    grid: { top: 56, left: 52, right: 52, bottom: 24 },
    xAxis: { type: 'category', data: yearly.map((r) => String(r.year)), axisLabel: axisText, axisLine: { lineStyle: { color: '#3a4152' } } },
    yAxis: [
      { type: 'value', name: 'raw hotspots', nameTextStyle: axisText, axisLabel: { ...axisText, formatter: (v: number) => (v >= 1000 ? v / 1000 + 'k' : String(v)) }, splitLine: split },
      { type: 'value', name: 'corrected fire-days', nameTextStyle: { ...axisText, color: '#f9cb35' }, axisLabel: { ...axisText, color: '#f9cb35', formatter: (v: number) => (v >= 1000 ? v / 1000 + 'k' : String(v)) }, splitLine: { show: false } },
    ],
    series: [
      ...SATELLITES.map((s) => ({
        name: SATELLITE_LABEL[s], type: 'bar' as const, stack: 'raw', data: yearly.map((r) => r.detected[s]),
        itemStyle: { color: SAT_COLOR[s], opacity: 0.85 }, barWidth: '62%',
      })),
      {
        name: 'Corrected (harmonized)', type: 'line' as const, yAxisIndex: 1, data: yearly.map((r) => r.count),
        lineStyle: { color: '#f9cb35', width: 3 }, itemStyle: { color: '#f9cb35', borderColor: '#0d1017', borderWidth: 2 }, symbolSize: 7, z: 5,
      },
    ],
  }), [yearly, unitMain]);
  return <EChart ref={ref} option={option} height={320} ariaLabel="Year by year: raw hotspots by satellite versus the corrected count" />;
});
