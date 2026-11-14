import { forwardRef, useMemo } from 'react';
import type * as echarts from 'echarts';
import { EChart, type EChartHandle } from './EChart';
import type { CalendarCell, MonthStats, YearlyRow } from '../types';
import { MONTHS_SHORT, SATELLITES, SATELLITE_LABEL } from '../types';
import { ANOMALY_SCALE, ANOMALY_TICKS, COUNTS_SCALE, NEUTRAL_CELL, NO_FIRE, anomalyPosition } from '../colors';
import { fmt, fmtPctShort, monthName, ordinal } from '../format';

export type CalendarMode = 'counts' | 'anomaly';

interface Props {
  calendar: CalendarCell[];
  average: MonthStats[];
  yearly: YearlyRow[];
  mode: CalendarMode;
  selected: { year: number; month: number } | null;
  onSelect: (year: number, month: number) => void;
  compact: boolean;
  unitMain: string;
}

const BG = '#0d1017';
const log = (v: number) => Math.log10(v + 1);

export const BurningCalendar = forwardRef<EChartHandle, Props>(function BurningCalendar(
  { calendar, average, yearly, mode, selected, onSelect, compact, unitMain },
  ref,
) {
  const years = useMemo(() => [...new Set(calendar.map((c) => c.year))].sort((a, b) => a - b), [calendar]);
  const maxCount = useMemo(() => Math.max(1, ...calendar.map((c) => c.count)), [calendar]);

  const option = useMemo<echarts.EChartsOption>(() => {
    const yCats = [...years.map(String), 'Average'];
    const xCats = [...MONTHS_SHORT, 'Year'];
    const avgY = years.length;
    const cellIndex = new Map<string, CalendarCell>();

    const countsMin = log(1);
    const countsMax = log(maxCount);

    const monthData = calendar.map((c) => {
      cellIndex.set(`${c.year}-${c.month}`, c);
      const x = c.month - 1;
      const y = years.indexOf(c.year);
      const v = mode === 'counts' ? (c.count === 0 ? -1 : log(c.count)) : anomalyPosition(c.vs_avg_pct);
      const isSel = selected?.year === c.year && selected?.month === c.month;
      const t = mode === 'counts' ? (v as number) / countsMax : Math.abs((v ?? 0) as number);
      const darkText = mode === 'counts' ? t > 0.72 : t < 1.1;
      return {
        value: [x, y, v === null ? '-' : v],
        itemStyle: {
          opacity: c.partial ? 0.5 : c.uncertain ? 0.75 : 1,
          borderColor: isSel ? '#ffffff' : BG,
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
        value: [12, years.indexOf(r.year), r.count],
        itemStyle: { borderColor: BG, borderWidth: compact ? 1 : 2, opacity: r.complete ? 1 : 0.6 },
        label: { formatter: () => (compact ? '' : fmt(r.count) + (r.complete ? '' : '*')), color: '#cfd3dc', fontWeight: 600 as const },
        _row: r,
      }));

    const avgRow = average.map((a) => ({
      value: [a.month - 1, avgY, a.mean],
      itemStyle: { borderColor: BG, borderWidth: compact ? 1 : 2 },
      label: { formatter: () => (compact ? '' : fmt(a.mean)), color: '#e9e6df', fontStyle: 'italic' as const },
      _avg: a,
    }));

    const tooltip: echarts.TooltipComponentOption = {
      backgroundColor: 'rgba(16,19,27,0.97)',
      borderColor: '#3a4152',
      textStyle: { color: '#ece9e2', fontFamily: 'Space Grotesk, system-ui', fontSize: 13 },
      extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);',
      formatter: (p: any) => {
        const [x, y] = p.value as [number, number];
        if (p.seriesIndex === 1) {
          const d = p.data as any;
          if (d._avg) {
            const a = d._avg as MonthStats;
            return `<b>${monthName(a.month)} — typical</b><br/>Mean ${fmt(a.mean)} · median ${fmt(a.median)}<br/>Usual range ${fmt(a.p10)}–${fmt(a.p90)} <span style="opacity:.6">(p10–p90, ${a.years} yrs)</span>`;
          }
          const r = d._row as YearlyRow;
          return `<b>${r.year} total</b><br/>${fmt(r.count)} ${unitMain}${r.complete ? '' : '<br/><i>Year not finished</i>'}${r.provisional ? '<br/><i>Includes provisional data</i>' : ''}`;
        }
        const c = cellIndex.get(`${years[y]}-${x + 1}`);
        if (!c) return '';
        const flags = [
          c.partial ? `◐ Partial: first ${c.days_covered} days` : '',
          c.provisional ? '▨ Provisional (near-real-time data)' : '',
          c.uncertain ? '⁙ Uncertain (few fires or high error)' : '',
        ].filter(Boolean);
        const det = SATELLITES.map((s) =>
          c.detected[s] === null
            ? `<span style="opacity:.45">${SATELLITE_LABEL[s]}: not in orbit</span>`
            : `${SATELLITE_LABEL[s]}: ${fmt(c.detected[s])}`,
        ).join('<br/>');
        return `<div style="min-width:210px"><b style="font-size:14px">${monthName(c.month)} ${c.year}</b><br/>
          <span style="font-size:20px;font-weight:700">${fmt(c.count)}</span> <span style="opacity:.7">${unitMain}</span><br/>
          ${fmtPctShort(c.vs_avg_pct)} vs average · ${ordinal(c.rank)} of ${c.of_years} years
          ${flags.length ? `<div style="margin-top:6px;color:#f9cb35">${flags.join('<br/>')}</div>` : ''}
          <div style="margin-top:6px;font-size:12px;opacity:.85">Raw hotspots detected<br/>${det}</div>
          <div style="margin-top:6px;font-size:11px;opacity:.55">Click to see this month on the map</div></div>`;
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
        axisLabel: { color: '#9aa1b0', fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: compact ? 9 : 12, interval: 0, formatter: (v: string) => (compact ? v.slice(0, 1) : v) },
      },
      yAxis: {
        type: 'category', data: yCats, inverse: true,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#9aa1b0', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: compact ? 9 : 11, formatter: (v: string) => (v === 'Average' ? (compact ? 'avg' : 'avg') : v) },
      },
      visualMap: [
        mode === 'counts'
          ? { show: false, seriesIndex: 0, type: 'continuous', min: countsMin, max: countsMax, inRange: { color: COUNTS_SCALE }, outOfRange: { color: NO_FIRE } }
          : { show: false, seriesIndex: 0, type: 'continuous', min: -2, max: 2, inRange: { color: ANOMALY_SCALE }, outOfRange: { color: NO_FIRE } },
        // Year totals + average row: one flat neutral colour (heatmaps require a visualMap).
        { show: false, seriesIndex: 1, type: 'piecewise', pieces: [{ min: -Infinity, max: Infinity, color: NEUTRAL_CELL }] },
      ],
      series: [
        {
          type: 'heatmap',
          data: monthData as any,
          label: {
            show: !compact,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10,
            formatter: (p: any) => {
              const [x, y] = p.value;
              const c = cellIndex.get(`${years[y]}-${x + 1}`);
              if (!c) return '';
              if (mode === 'counts') return c.count >= 1000 ? (c.count / 1000).toFixed(1) + 'k' : String(c.count);
              if (c.vs_avg_pct === null) return '—';
              const r = Math.round(c.vs_avg_pct);
              return r > 0 ? `+${r > 999 ? '999' : r}` : String(r);
            },
          },
          emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } },
          progressive: 0,
        },
        { type: 'heatmap', data: [...yearTotals, ...avgRow] as any, label: { show: true, fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10 }, emphasis: { disabled: true } },
      ],
    };
  }, [calendar, average, yearly, years, maxCount, mode, selected, compact, unitMain]);

  const height = 26 + (compact ? 17 : 22) * (years.length + 1) + 8;

  return (
    <EChart
      ref={ref}
      option={option}
      height={height}
      ariaLabel={`Burning calendar: ${years.length} years by 12 months of ${unitMain}. Hover a cell for numbers, click to open it on the map.`}
      onEvents={{
        click: (p: any) => {
          if (p.seriesIndex !== 0) return;
          const [x, y] = p.value;
          onSelect(years[y], x + 1);
        },
      }}
    />
  );
});

export function CalendarLegend({ mode, maxCount }: { mode: CalendarMode; maxCount: number }) {
  const scale = mode === 'counts' ? COUNTS_SCALE : ANOMALY_SCALE;
  const ticks =
    mode === 'counts'
      ? [1, 10, 100, 1000, 10000].filter((t) => t <= maxCount).map((t) => ({ pos: Math.log10(t + 1) / Math.log10(maxCount + 1), label: fmt(t) }))
      : ANOMALY_TICKS.map((t) => ({ pos: (t.pos + 2) / 4, label: t.label }));
  return (
    <div className="legend" aria-label="Calendar legend">
      <div className="legend-scale">
        <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${scale.join(',')})` }} />
        <div className="legend-ticks">
          {ticks.map((t) => (
            <span key={t.label} style={{ left: `${t.pos * 100}%` }}>{t.label}</span>
          ))}
        </div>
        <div className="legend-caption">
          {mode === 'counts' ? 'Corrected fire-days per month (log scale)' : '▼ below average · ▲ above average (ratio to the multi-year mean)'}
        </div>
      </div>
      <ul className="legend-keys">
        <li><span className="swatch swatch-nofire" />No fires</li>
        <li><span className="swatch swatch-provisional" />Provisional</li>
        <li><span className="swatch swatch-uncertain" />Uncertain</li>
        <li><span className="swatch swatch-partial" />Partial month</li>
      </ul>
    </div>
  );
}
