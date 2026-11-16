// The fire calendar as a dense heatmap (detailed view): every year on one screen, and a PNG to download.
// The quick view draws the same months as marked days: see FireCalendar.tsx.
import { forwardRef, useMemo } from 'react';
import type * as echarts from 'echarts';
import { CHART_BG, CHART_FONT, EChart, type EChartHandle } from './EChart';
import type { Mode } from './FireCalendar';
import type { CalendarItem, MonthAverage, YearItem } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { ANOMALY_SCALE, ANOMALY_TICKS, COUNTS_SCALE, NEUTRAL_CELL, NO_FIRE, anomalyPosition } from '../colors';
import { MON, MONTHS, compact as short, num, ordinal, pctShort, times } from '../format';

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
const AVG = 'Avg';

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
      const darkText = mode === 'counts' ? t < 0.62 : t < 1.1;
      return {
        value: [c.month - 1, rowOf(c.year), v === null ? '-' : v],
        itemStyle: {
          // faded = uncertain, as on the Quick view (no stripes: provisional and uncertain are said in the tooltip and the month card)
          opacity: c.uncertain ? 0.45 : 1,
          borderColor: isSel ? '#1d1d1f' : CHART_BG,
          borderWidth: isSel ? 2.5 : compact ? 1 : 2,
        },
        label: { color: darkText ? '#1d1d1f' : '#ffffff' },
      };
    });

    const yearTotals = yearly
      .filter((r) => years.includes(r.year))
      .map((r) => ({
        value: [12, rowOf(r.year), r.count ?? '-'],
        itemStyle: { borderColor: CHART_BG, borderWidth: compact ? 1 : 2, opacity: r.complete ? 1 : 0.6 },
        // phones: the short form ("2.3k") so the Year column is not a row of blank boxes
        label: { formatter: () => (compact ? short(r.count) : num(r.count)) + (r.complete ? '' : '*'), color: '#1d1d1f', fontWeight: 600 as const, ...(compact ? { fontSize: 9 } : {}) },
        _row: r,
      }));

    // Phones (compact) have no numbers in the cells, so the average row takes the month cells' colour scale
    // (counts: its mean; vs Average: the neutral middle, since it is the average) instead of a blank neutral row.
    const avgValue = (mean: number | null) =>
      mean == null ? '-' : !compact ? mean : mode === 'counts' ? (mean === 0 ? -1 : log(mean)) : 0;
    const avgRow = average.map((a) => ({
      value: [a.month - 1, 0, avgValue(a.mean)],
      // compact: a thin dotted edge marks the coloured average row as typical, like the quick view's dotted bricks
      itemStyle: compact ? { borderColor: '#86868b', borderWidth: 1, borderType: 'dotted' as const } : { borderColor: CHART_BG, borderWidth: 2 },
      label: { formatter: () => (compact ? '' : num(a.mean)), color: '#707070', fontStyle: 'italic' as const },
      _avg: a,
    }));

    const tooltip: echarts.TooltipComponentOption = {
      confine: true, // stays inside the card (overflow: hidden) at the heatmap's edges
      backgroundColor: '#ffffff',
      borderColor: '#d6d6d6',
      textStyle: { color: '#1d1d1f', fontFamily: CHART_FONT, fontSize: 13 },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.12);',
      formatter: (p: any) => {
        const [x, y] = p.value as [number, number];
        if (p.seriesIndex >= 1) {
          const d = p.data as any;
          if (d._avg) {
            const a = d._avg as MonthAverage;
            return `<b>${MONTHS[a.month - 1]} on average</b> <span style="opacity:.6">(${period})</span><br/>${num(a.mean)} ${unitMain}<br/>Usual range ${num(a.p10)}–${num(a.p90)}`;
          }
          const r = d._row as YearItem;
          return `<b>${r.year} total</b><br/>${num(r.count)} ${unitMain}${r.complete ? '' : '<br/><i>Year in progress</i>'}${r.provisional ? '<br/><i>Partly provisional</i>' : ''}`;
        }
        const c = cellIndex.get(`${years[y - 1]}-${x + 1}`);
        if (!c) return '';
        const flags = [
          c.partial ? 'Month in progress' : '',
          c.provisional ? 'Provisional' : '',
          c.uncertain ? 'Uncertain: few fires' : '',
        ].filter(Boolean);
        const det = SATELLITES.map((s) =>
          c.detected[s] == null
            ? `<span style="opacity:.45">${SAT_NAMES[s]}: no data</span>`
            : `${SAT_NAMES[s]}: ${num(c.detected[s])}`,
        ).join('<br/>');
        return `<div style="min-width:210px"><b style="font-size:14px">${MONTHS[c.month - 1]} ${c.year}</b><br/>
          <span style="font-size:20px;font-weight:700">${num(c.count)}</span> <span style="opacity:.7">${unitMain}</span><br/>
          ${pctShort(c.vs_avg_pct)} vs typical${c.rank != null ? ` · ${ordinal(c.rank)} of ${c.of_years}` : ''}
          ${flags.length ? `<div style="margin-top:6px;color:#b64400">${flags.join('<br/>')}</div>` : ''}
          <div style="margin-top:6px;font-size:12px;opacity:.85">Satellite detections<br/>${det}</div>
          <div style="margin-top:6px;font-size:11px;opacity:.55">Click: details and map</div></div>`;
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
        axisLabel: { color: '#707070', fontFamily: CHART_FONT, fontSize: compact ? 9 : 12, interval: 0, formatter: (v: string) => (compact ? v.slice(0, 1) : v) },
      },
      yAxis: {
        type: 'category', data: yCats, inverse: true,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#707070', fontFamily: CHART_FONT, fontSize: compact ? 9 : 11 },
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
              if (mode === 'counts') return short(c.count);
              if (c.vs_avg_pct === null) return '–';
              // 3 times or more as "3.6×" (no ".0"), like the rest of the site; below that a signed %
              if (c.vs_avg_pct >= 200) return `${c.vs_avg_pct >= 900 ? Math.round(c.vs_avg_pct / 100 + 1) : times(c.vs_avg_pct)}×`;
              const r = Math.round(c.vs_avg_pct);
              return r > 0 ? `+${r}` : String(r);
            },
          },
          emphasis: { itemStyle: { borderColor: '#1d1d1f', borderWidth: 2 } },
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
      ariaLabel={`Fire calendar: ${unitMain} per month, ${years.length} years. Hover a month for numbers, click it for details and the map.`}
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
        <div className="hm-bar">{scale.map((c) => <i key={c} style={{ background: c }} />)}</div>
        <div className="hm-ticks">
          {ticks.map((t) => (
            <span key={t.label} style={{ left: `${t.pos * 100}%` }}>{t.label}</span>
          ))}
        </div>
        <div className="hm-caption">
          {mode === 'counts' ? 'Hotspots per month' : '▼ lower · ▲ higher than typical'}
        </div>
      </div>
    </div>
  );
}
