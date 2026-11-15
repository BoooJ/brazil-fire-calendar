// The burning calendar as a dense heatmap (detailed view): every year on one screen, and a PNG to download.
// The quick view draws the same months as marked days: see FireCalendar.tsx.
import { forwardRef, useMemo } from 'react';
import type * as echarts from 'echarts';
import { CHART_BG, CHART_FONT, EChart, type EChartHandle } from './EChart';
import type { Mode } from './FireCalendar';
import type { CalendarItem, MonthAverage, YearItem } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { ANOMALY_SCALE, ANOMALY_TICKS, COUNTS_SCALE, NEUTRAL_CELL, NO_FIRE, anomalyPosition } from '../colors';
import { MON, MONTHS, compact as short, num, ordinal, pctShort } from '../format';

interface Props {
  calendar: CalendarItem[];
  average: MonthAverage[];
  yearly: YearItem[];
  mode: Mode;
  selected: { year: number; month: number } | null;
  onSelect: (year: number, month: number) => void;
  /** phone: smaller cells, numbers only in the tooltip */
  compact: boolean;
  unitMain: string;
  period: string;
}

const log = (v: number) => Math.log10(v + 1);
const AVG = 'avg';

export const BurningCalendar = forwardRef<EChartHandle, Props>(function BurningCalendar(
  { calendar, average, yearly, mode, selected, onSelect, compact, unitMain, period },
  ref,
) {
  // newest year first, under the average row: the same order as the quick view
  const years = useMemo(() => [...new Set(calendar.map((c) => c.year))].sort((a, b) => b - a), [calendar]);
  const maxCount = useMemo(() => Math.max(1, ...calendar.map((c) => c.count ?? 0)), [calendar]);

  const option = useMemo<echarts.EChartsOption>(() => {
    const yCats = [AVG, ...years.map(String)];
    const xCats = [...MON, 'Year'];
    const rowOf = (year: number) => years.indexOf(year) + 1;
    const cellIndex = new Map<string, CalendarItem>();
    const countsMax = log(maxCount);

    const monthData = calendar.map((c) => {
      cellIndex.set(`${c.year}-${c.month}`, c);
      const v = mode === 'counts' ? (c.count == null ? null : c.count === 0 ? -1 : log(c.count)) : anomalyPosition(c.vs_avg_pct);
      const isSel = selected?.year === c.year && selected?.month === c.month;
      const t = mode === 'counts' ? (v ?? 0) / countsMax : Math.abs(v ?? 0);
      const darkText = mode === 'counts' ? t > 0.72 : t < 1.1;
      return {
        value: [c.month - 1, rowOf(c.year), v === null ? '-' : v],
        itemStyle: {
          opacity: c.partial ? 0.5 : c.uncertain ? 0.6 : 1,
          borderColor: isSel ? '#ffffff' : CHART_BG,
          borderWidth: isSel ? 2.5 : compact ? 1 : 2,
          decal: c.provisional
            ? { symbol: 'rect', symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: 'rgba(13,16,23,0.55)' }
            : c.uncertain
              ? { symbol: 'circle', symbolSize: 0.5, dashArrayX: [[4, 4]], dashArrayY: [4, 0], color: 'rgba(13,16,23,0.6)' }
              : undefined,
        },
        label: { color: darkText ? '#111' : '#f3f0ea' },
      };
    });

    const yearTotals = yearly
      .filter((r) => years.includes(r.year))
      .map((r) => ({
        value: [12, rowOf(r.year), r.count ?? '-'],
        itemStyle: { borderColor: CHART_BG, borderWidth: compact ? 1 : 2, opacity: r.complete ? 1 : 0.6 },
        // phones: the short form ("2.3k") so the Year column is not a row of blank boxes
        label: { formatter: () => (compact ? short(r.count) : num(r.count)) + (r.complete ? '' : '*'), color: '#cfd3dc', fontWeight: 600 as const, ...(compact ? { fontSize: 9 } : {}) },
        _row: r,
      }));

    // Phones (compact) have no numbers in the cells, so the average row takes the month cells' colour scale
    // (counts: its mean; vs Average: the neutral middle, since it is the average) instead of a blank neutral row.
    const avgValue = (mean: number | null) =>
      mean == null ? '-' : !compact ? mean : mode === 'counts' ? (mean === 0 ? -1 : log(mean)) : 0;
    const avgRow = average.map((a) => ({
      value: [a.month - 1, 0, avgValue(a.mean)],
      // compact: a thin dotted edge marks the coloured average row as typical, like the quick view's dotted bricks
      itemStyle: compact ? { borderColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderType: 'dotted' as const } : { borderColor: CHART_BG, borderWidth: 2 },
      label: { formatter: () => (compact ? '' : num(a.mean)), color: '#e9e6df', fontStyle: 'italic' as const },
      _avg: a,
    }));

    const tooltip: echarts.TooltipComponentOption = {
      confine: true, // stays inside the card (overflow: hidden) at the heatmap's edges
      backgroundColor: 'rgba(16,19,27,0.97)',
      borderColor: '#3a4152',
      textStyle: { color: '#ece9e2', fontFamily: CHART_FONT, fontSize: 13 },
      extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);',
      formatter: (p: any) => {
        const [x, y] = p.value as [number, number];
        if (p.seriesIndex >= 1) {
          const d = p.data as any;
          if (d._avg) {
            const a = d._avg as MonthAverage;
            return `<b>${MONTHS[a.month - 1]}, typical</b> <span style="opacity:.6">(${period})</span><br/>Mean ${num(a.mean)} · median ${num(a.median)}<br/>Usual range ${num(a.p10)}–${num(a.p90)}` +
              `<div style="margin-top:6px;font-size:11px;opacity:.6">History, not a forecast</div>`;
          }
          const r = d._row as YearItem;
          return `<b>${r.year} total</b><br/>${num(r.count)} ${unitMain}${r.complete ? '' : '<br/><i>Year not finished</i>'}${r.provisional ? '<br/><i>Includes provisional data</i>' : ''}`;
        }
        const c = cellIndex.get(`${years[y - 1]}-${x + 1}`);
        if (!c) return '';
        const flags = [
          c.partial ? `◐ Partial: first ${c.days_covered} days` : '',
          c.provisional ? '▨ Provisional (near-real-time data)' : '',
          c.uncertain ? '⁙ Uncertain (few fires or a large conversion error)' : '',
        ].filter(Boolean);
        const det = SATELLITES.map((s) =>
          c.detected[s] == null
            ? `<span style="opacity:.45">${SAT_NAMES[s]}: no data</span>`
            : `${SAT_NAMES[s]}: ${num(c.detected[s])}`,
        ).join('<br/>');
        return `<div style="min-width:210px"><b style="font-size:14px">${MONTHS[c.month - 1]} ${c.year}</b><br/>
          <span style="font-size:20px;font-weight:700">${num(c.count)}</span> <span style="opacity:.7">${unitMain}</span><br/>
          ${pctShort(c.vs_avg_pct)} vs average${c.rank != null ? ` · ${ordinal(c.rank)} of ${c.of_years} years` : ''}
          ${flags.length ? `<div style="margin-top:6px;color:#f9cb35">${flags.join('<br/>')}</div>` : ''}
          <div style="margin-top:6px;font-size:12px;opacity:.85">Raw hotspots detected<br/>${det}</div>
          <div style="margin-top:6px;font-size:11px;opacity:.55">Click for details and the map</div></div>`;
      },
    };

    const rowH = compact ? 17 : 22;
    return {
      animation: false,
      aria: { enabled: true, decal: { show: false } },
      tooltip,
      grid: { top: 26, left: compact ? 36 : 46, right: compact ? 4 : 8, bottom: 4, height: rowH * yCats.length },
      xAxis: {
        type: 'category', data: xCats, position: 'top',
        axisLine: { show: false }, axisTick: { show: false }, splitArea: { show: false },
        axisLabel: { color: '#9aa1b0', fontFamily: CHART_FONT, fontSize: compact ? 9 : 12, interval: 0, formatter: (v: string) => (compact ? v.slice(0, 1) : v) },
      },
      yAxis: {
        type: 'category', data: yCats, inverse: true,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#9aa1b0', fontFamily: CHART_FONT, fontSize: compact ? 9 : 11 },
      },
      visualMap: [
        mode === 'counts'
          ? { show: false, seriesIndex: compact ? [0, 2] : 0, type: 'continuous', min: log(1), max: countsMax, inRange: { color: COUNTS_SCALE }, outOfRange: { color: NO_FIRE } }
          : { show: false, seriesIndex: compact ? [0, 2] : 0, type: 'continuous', min: -2, max: 2, inRange: { color: ANOMALY_SCALE }, outOfRange: { color: NO_FIRE } },
        // Year totals + average row: one flat neutral colour (heatmaps require a visualMap).
        { show: false, seriesIndex: 1, type: 'piecewise', pieces: [{ min: -Infinity, max: Infinity, color: NEUTRAL_CELL }] },
      ],
      series: [
        {
          type: 'heatmap',
          data: monthData as any,
          label: {
            show: !compact,
            fontFamily: CHART_FONT, fontSize: 10, fontWeight: 600,
            formatter: (p: any) => {
              const [x, y] = p.value;
              const c = cellIndex.get(`${years[y - 1]}-${x + 1}`);
              if (!c) return '';
              if (mode === 'counts') return c.count == null ? '–' : c.count >= 1000 ? (c.count / 1000).toFixed(1) + 'k' : String(c.count);
              if (c.vs_avg_pct === null) return '–';
              const r = Math.round(c.vs_avg_pct);
              return r > 0 ? `+${r > 999 ? '999' : r}` : String(r);
            },
          },
          emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } },
          progressive: 0,
        },
        { type: 'heatmap', data: (compact ? yearTotals : [...yearTotals, ...avgRow]) as any, label: { show: true, fontFamily: CHART_FONT, fontSize: 10 }, emphasis: { disabled: true } },
        ...(compact ? [{ type: 'heatmap' as const, data: avgRow as any, label: { show: false }, emphasis: { disabled: true } }] : []),
      ],
    };
  }, [calendar, average, yearly, years, maxCount, mode, selected, compact, unitMain, period]);

  const height = 26 + (compact ? 17 : 22) * (years.length + 1) + 8;

  return (
    <EChart
      ref={ref}
      option={option}
      height={height}
      ariaLabel={`Burning calendar: ${years.length} years by 12 months of ${unitMain}. Hover a cell for numbers, click it for details and the map.`}
      onEvents={{
        click: (p: any) => {
          if (p.seriesIndex !== 0) return;
          const [x, y] = p.value;
          onSelect(years[y - 1], x + 1);
        },
      }}
    />
  );
});

export function HeatmapLegend({ mode, maxCount }: { mode: Mode; maxCount: number }) {
  const scale = mode === 'counts' ? COUNTS_SCALE : ANOMALY_SCALE;
  const ticks =
    mode === 'counts'
      ? [1, 10, 100, 1000, 10000, 100000].filter((t) => t <= maxCount).map((t) => ({ pos: Math.log10(t + 1) / Math.log10(maxCount + 1), label: num(t) }))
      : ANOMALY_TICKS.map((t) => ({ pos: (t.pos + 2) / 4, label: t.label }));
  return (
    <div className="hm-legend" aria-label="Heatmap legend">
      <div className="hm-scale">
        <div className="hm-bar" style={{ background: `linear-gradient(90deg, ${scale.join(',')})` }} />
        <div className="hm-ticks">
          {ticks.map((t) => (
            <span key={t.label} style={{ left: `${t.pos * 100}%` }}>{t.label}</span>
          ))}
        </div>
        <div className="hm-caption">
          {mode === 'counts' ? 'Corrected fire-days per month (log scale)' : '▼ below average · ▲ above average (ratio to the multi-year mean)'}
        </div>
      </div>
      <ul className="hm-keys">
        <li><span className="swatch swatch-nofire" />No fires</li>
        <li><span className="swatch swatch-provisional" />Provisional (hatched)</li>
        <li><span className="swatch swatch-uncertain" />Uncertain (faded, dotted)</li>
        <li><span className="swatch swatch-partial" />Partial: month in progress</li>
      </ul>
    </div>
  );
}
