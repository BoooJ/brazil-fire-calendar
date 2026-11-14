// The two charts of the detailed view: the typical year, and raw hotspots vs the corrected count, year by year.
import { forwardRef, useMemo } from 'react';
import type * as echarts from 'echarts';
import { CHART_BG, CHART_FONT, EChart, type EChartHandle } from './EChart';
import type { CalendarItem, MonthAverage, YearItem } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { SAT_COLOR } from '../colors';
import { MON, num } from '../format';

const axisText = { color: '#9aa1b0', fontFamily: CHART_FONT, fontSize: 11 };
const split = { lineStyle: { color: '#222736' } };
const tooltipBase: echarts.TooltipComponentOption = {
  trigger: 'axis',
  backgroundColor: 'rgba(16,19,27,0.97)',
  borderColor: '#3a4152',
  textStyle: { color: '#ece9e2', fontFamily: CHART_FONT, fontSize: 12 },
};
const legendBase: echarts.LegendComponentOption = { top: 0, textStyle: { color: '#c9cdd6', fontFamily: CHART_FONT }, itemWidth: 14, itemHeight: 8 };
const thousands = (v: number) => (v >= 1000 ? v / 1000 + 'k' : String(v));

export const TypicalYearChart = forwardRef<EChartHandle, { average: MonthAverage[]; calendar: CalendarItem[]; refYear: number; period: string; compact: boolean }>(
  function TypicalYearChart({ average, calendar, refYear, period, compact }, ref) {
    const option = useMemo<echarts.EChartsOption>(() => {
      const byMonth = MON.map((_, i) => average.find((a) => a.month === i + 1) ?? null);
      const refCells = MON.map((_, i) => calendar.find((c) => c.year === refYear && c.month === i + 1) ?? null);
      const band = compact ? 'Usual range' : `Usual range (p10–p90, ${period})`; // a phone: the legend stays on one line
      return {
        animationDuration: 500,
        tooltip: {
          ...tooltipBase,
          formatter: (ps: any) => {
            const i = ps[0].dataIndex;
            const a = byMonth[i];
            const c = refCells[i];
            return `<b>${MON[i]}</b>` +
              (a ? `<br/>Usual range ${num(a.p10)}–${num(a.p90)}<br/>Median ${num(a.median)} · mean ${num(a.mean)}` : '') +
              (c ? `<br/><b style="color:#f9cb35">${refYear}: ${num(c.count)}</b>${c.partial ? ` (first ${c.days_covered} days)` : ''}` : '');
          },
        },
        legend: { ...legendBase, data: [band, 'Median', String(refYear)] },
        grid: { top: compact ? 52 : 34, left: 44, right: 12, bottom: 24 },
        xAxis: { type: 'category', data: MON, axisLabel: axisText, axisLine: { lineStyle: { color: '#3a4152' } }, boundaryGap: false },
        yAxis: { type: 'value', axisLabel: axisText, splitLine: split, name: 'fire-days', nameTextStyle: axisText },
        series: [
          { name: 'p10', type: 'line', data: byMonth.map((a) => a?.p10 ?? null), stack: 'band', lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
          {
            name: band, type: 'line', data: byMonth.map((a) => (a?.p10 == null || a.p90 == null ? null : a.p90 - a.p10)), stack: 'band',
            lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: 'rgba(180,164,216,0.28)' }, itemStyle: { color: '#b4a4d8' },
          },
          { name: 'Median', type: 'line', data: byMonth.map((a) => a?.median ?? null), symbol: 'none', lineStyle: { color: '#b4a4d8', width: 2, type: 'dashed' }, itemStyle: { color: '#b4a4d8' } },
          {
            name: String(refYear), type: 'line', data: refCells.map((c) => c?.count ?? null), connectNulls: false,
            lineStyle: { color: '#f9cb35', width: 3 }, itemStyle: { color: '#f9cb35' }, symbolSize: 7,
          },
        ],
      };
    }, [average, calendar, refYear, period, compact]);
    return <EChart ref={ref} option={option} height={compact ? 300 : 280} ariaLabel={`Typical year: usual monthly range compared with ${refYear}`} />;
  },
);

export const YearlyChart = forwardRef<EChartHandle, { yearly: YearItem[]; unitMain: string; compact: boolean }>(function YearlyChart({ yearly, unitMain, compact }, ref) {
  const option = useMemo<echarts.EChartsOption>(() => ({
    animationDuration: 500,
    tooltip: {
      ...tooltipBase,
      formatter: (ps: any) => {
        const r = yearly[ps[0].dataIndex];
        const raw = SATELLITES.map((s) => (r.detected[s] == null ? '' : `${SAT_NAMES[s]}: ${num(r.detected[s])}<br/>`)).join('');
        return `<b>${r.year}</b>${r.complete ? '' : ' <i>(not finished)</i>'}<br/><b style="color:#f9cb35">Corrected: ${num(r.count)}</b> ${unitMain}<br/><span style="opacity:.8">Raw hotspots:</span><br/>${raw}`;
      },
    },
    legend: { ...legendBase, data: [...SATELLITES.map((s) => SAT_NAMES[s]), 'Corrected (harmonized)'] },
    grid: { top: compact ? 96 : 56, left: compact ? 44 : 52, right: compact ? 40 : 52, bottom: 24 }, // a phone: the legend takes two or three lines
    xAxis: { type: 'category', data: yearly.map((r) => String(r.year)), axisLabel: axisText, axisLine: { lineStyle: { color: '#3a4152' } } },
    yAxis: [
      { type: 'value', name: 'raw hotspots', nameTextStyle: axisText, axisLabel: { ...axisText, formatter: thousands }, splitLine: split },
      { type: 'value', name: 'corrected fire-days', nameTextStyle: { ...axisText, color: '#f9cb35' }, axisLabel: { ...axisText, color: '#f9cb35', formatter: thousands }, splitLine: { show: false } },
    ],
    series: [
      ...SATELLITES.map((s) => ({
        name: SAT_NAMES[s], type: 'bar' as const, stack: 'raw', data: yearly.map((r) => r.detected[s]),
        itemStyle: { color: SAT_COLOR[s], opacity: 0.85 }, barWidth: '62%',
      })),
      {
        name: 'Corrected (harmonized)', type: 'line' as const, yAxisIndex: 1, data: yearly.map((r) => r.count),
        lineStyle: { color: '#f9cb35', width: 3 }, itemStyle: { color: '#f9cb35', borderColor: CHART_BG, borderWidth: 2 }, symbolSize: 7, z: 5,
      },
    ],
  }), [yearly, unitMain, compact]);
  return <EChart ref={ref} option={option} height={compact ? 360 : 320} ariaLabel="Year by year: raw hotspots by satellite versus the corrected count" />;
});
