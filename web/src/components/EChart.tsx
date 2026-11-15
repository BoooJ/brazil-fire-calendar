import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([HeatmapChart, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, AriaComponent, CanvasRenderer]);

/** The charts are dark panels on the white sheet: one background, one text face. */
export const CHART_BG = '#0d1017'; // same as --panel in styles.css
export const CHART_FONT = "'Inter Variable', Inter, system-ui, sans-serif";

export interface EChartHandle {
  /** PNG of the chart on its dark background, for the download buttons. */
  toPng: () => string | undefined;
}

interface Props {
  option: EChartsOption;
  height: number | string;
  ariaLabel: string;
  onEvents?: Record<string, (params: any) => void>;
}

export const EChart = forwardRef<EChartHandle, Props>(function EChart({ option, height, ariaLabel, onEvents }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const events = useRef(onEvents);
  events.current = onEvents;

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    // canvas text is drawn once: draw it again when the web font has arrived
    document.fonts?.ready.then(() => !c.isDisposed() && c.resize());
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  const eventNames = onEvents ? Object.keys(onEvents).join() : '';
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const names = eventNames ? eventNames.split(',') : [];
    for (const name of names) {
      c.off(name);
      c.on(name, (p: any) => events.current?.[name]?.(p));
    }
    return () => {
      if (!c.isDisposed()) names.forEach((n) => c.off(n));
    };
  }, [eventNames]);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useImperativeHandle(ref, () => ({
    toPng: () => chart.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: CHART_BG }),
  }));

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />;
});

/** Saves a chart as a PNG file. */
export function savePng(handle: EChartHandle | null, name: string) {
  const url = handle?.toPng();
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
