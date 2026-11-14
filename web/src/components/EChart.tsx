import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([HeatmapChart, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, AriaComponent, CanvasRenderer]);

export interface EChartHandle {
  /** PNG of the chart on the page background, for the download buttons. */
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
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const names = Object.keys(onEvents ?? {});
    for (const name of names) {
      c.off(name);
      c.on(name, (p: any) => events.current?.[name]?.(p));
    }
    return () => {
      if (!c.isDisposed()) names.forEach((n) => c.off(n));
    };
  }, [onEvents ? Object.keys(onEvents).join() : '']);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useImperativeHandle(ref, () => ({
    toPng: () => chart.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0d1017' }),
  }));

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />;
});
