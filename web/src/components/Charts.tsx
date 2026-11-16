// The two charts of the detailed view: hotspots by month (usual range vs this year), and satellite detections vs adjusted hotspots, year by year.
import { forwardRef, useMemo } from 'react';
import type * as echarts from 'echarts';
import { CHART_BG, CHART_FONT, EChart, type EChartHandle } from './EChart';
import type { CalendarItem, MonthAverage, YearItem } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { EMBER, SAT_COLOR } from '../colors';
import { MON, num } from '../format';

const axisText = { color: '#707070', fontFamily: CHART_FONT, fontSize: 11 };
const split = { lineStyle: { color: '#ececf0' } };
const tooltipBase: echarts.TooltipComponentOption = {
  trigger: 'axis',
  confine: true, // the chart card clips overflow: keep the tooltip inside the chart on phones
  backgroundColor: '#ffffff',
  borderColor: '#d6d6d6',
  textStyle: { color: '#1d1d1f', fontFamily: CHART_FONT, fontSize: 12 },
  extraCssText: 'border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.12);',
};
const legendBase: echarts.LegendComponentOption = { top: 0, textStyle: { color: '#1d1d1f', fontFamily: CHART_FONT }, itemWidth: 14, itemHeight: 8 };
const thousands = (v: number) => (v >= 1000 ? v / 1000 + 'k' : String(v));

export const TypicalYearChart = forwardRef<EChartHandle, { average: MonthAverage[]; calendar: CalendarItem[]; refYear: number; period: string; compact: boolean }>(
  function TypicalYearChart({ average, calendar, refYear, period, compact }, ref) {
    const option = useMemo<echarts.EChartsOption>(() => {
      const byMonth = MON.map((_, i) => average.find((a) => a.month === i + 1) ?? null);
      const refCells = MON.map((_, i) => calendar.find((c) => c.year === refYear && c.month === i + 1) ?? null);
      const band = compact ? 'Usual range' : `Usual range (${period})`; // a phone: the legend stays on one line
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
              (c ? `<br/><b style="color:#d9480f">${refYear}: ${num(c.count)}</b>${c.partial ? ` (first ${c.days_covered} days)` : ''}` : '');
          },
        },
        legend: { ...legendBase, data: [band, 'Median', String(refYear)] },
        grid: { top: compact ? 52 : 34, left: 44, right: 12, bottom: 24 },
        xAxis: { type: 'category', data: MON, axisLabel: axisText, axisLine: { lineStyle: { color: '#d6d6d6' } }, boundaryGap: false },
        yAxis: { type: 'value', axisLabel: axisText, splitLine: split, name: 'hotspots', nameTextStyle: axisText },
        series: [
          { name: 'p10', type: 'line', data: byMonth.map((a) => a?.p10 ?? null), stack: 'band', lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
          {
            name: band, type: 'line', data: byMonth.map((a) => (a?.p10 == null || a.p90 == null ? null : a.p90 - a.p10)), stack: 'band',
            lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: 'rgba(123,92,184,0.16)' }, itemStyle: { color: '#7b5cb8' },
          },
          { name: 'Median', type: 'line', data: byMonth.map((a) => a?.median ?? null), symbol: 'none', lineStyle: { color: '#7b5cb8', width: 2, type: 'dashed' }, itemStyle: { color: '#7b5cb8' } },
          {
            name: String(refYear), type: 'line', connectNulls: false,
            // a month in progress (fewer days) is a hollow point, so its lower value does not read as a drop
            data: refCells.map((c) => (c?.partial ? { value: c.count, itemStyle: { color: CHART_BG, borderColor: EMBER, borderWidth: 2 } } : (c?.count ?? null))),
            lineStyle: { color: EMBER, width: 3 }, itemStyle: { color: EMBER }, symbol: 'circle', symbolSize: 7,
          },
        ],
      };
    }, [average, calendar, refYear, period, compact]);
    return <EChart ref={ref} option={option} height={compact ? 300 : 280} ariaLabel={`Hotspots by month: usual range compared with ${refYear}`} />;
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
        return `<b>${r.year}</b>${r.complete ? '' : ' <i>(in progress)</i>'}<br/><b style="color:#d9480f">${num(r.count)} ${unitMain}</b><br/><span style="opacity:.8">Satellite detections:</span><br/>${raw}`;
      },
    },
    legend: { ...legendBase, data: [...SATELLITES.map((s) => SAT_NAMES[s]), 'Hotspots (adjusted)'] },
    grid: { top: compact ? 96 : 56, left: compact ? 44 : 52, right: compact ? 40 : 52, bottom: 24 }, // a phone: the legend takes two or three lines
    xAxis: { type: 'category', data: yearly.map((r) => String(r.year)), axisLabel: axisText, axisLine: { lineStyle: { color: '#d6d6d6' } } },
    yAxis: [
      { type: 'value', name: 'satellite detections', nameTextStyle: { ...axisText, align: 'left' }, axisLabel: { ...axisText, formatter: thousands }, splitLine: split },
      { type: 'value', name: 'hotspots', nameTextStyle: { ...axisText, color: EMBER, align: 'right' }, axisLabel: { ...axisText, color: EMBER, formatter: thousands }, splitLine: { show: false } },
    ],
    series: [
      ...SATELLITES.map((s) => ({
        name: SAT_NAMES[s], type: 'bar' as const, stack: 'raw', data: yearly.map((r) => r.detected[s]),
        itemStyle: { color: SAT_COLOR[s], opacity: 0.85 }, barWidth: '62%',
      })),
      {
        name: 'Hotspots (adjusted)', type: 'line' as const, yAxisIndex: 1,
        // a year not finished is a hollow point (yellow ring), so its lower total does not read as a drop
        data: yearly.map((r) => (r.complete ? r.count : { value: r.count, itemStyle: { color: CHART_BG, borderColor: EMBER, borderWidth: 2 } })),
        lineStyle: { color: EMBER, width: 3 }, itemStyle: { color: EMBER, borderColor: CHART_BG, borderWidth: 2 }, symbol: 'circle', symbolSize: 7, z: 5,
      },
    ],
  }), [yearly, unitMain, compact]);
  return <EChart ref={ref} option={option} height={compact ? 360 : 320} ariaLabel="Year by year: satellite detections by satellite versus the adjusted hotspots" />;
});
