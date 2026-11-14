"""Builds web/public/index.html (the landing page) from the mocks, so the product UI on it is live HTML.
Re-run when the mocks or the copy change:  python3 gen.py
"""
import json, math, html
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
A = json.loads((WEB / 'mocks/analysis.pantanal.json').read_text())
H = json.loads((WEB / 'mocks/hotspots.pantanal.2020-09.geojson').read_text())

SCALE = ['#2a0b4a', '#57106e', '#8a226a', '#bc3754', '#e45a31', '#f98e09', '#f9cb35', '#fcffa4']
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
cal = {(c['year'], c['month']): c for c in A['calendar']}
yearly = {r['year']: r for r in A['yearly']}
maxc = max(c['count'] for c in A['calendar'])


def hx(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def colour(count):
    t = math.log10(count + 1) / math.log10(maxc + 1)
    p = t * (len(SCALE) - 1)
    i = min(int(p), len(SCALE) - 2)
    f = p - i
    a, b = hx(SCALE[i]), hx(SCALE[i + 1])
    rgb = tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))
    return '#%02x%02x%02x' % rgb, t


def fmt(n):
    return f'{round(n):,}'


def ordinal(n):
    return str(n) + ('th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th'))


def short(n):
    return f'{n / 1000:.1f}k' if n >= 1000 else str(n)


def cell(y, m):
    c = cal.get((y, m))
    if not c:
        return '<i class="bfc-cal__c is-empty"></i>'
    bg, t = colour(c['count'])
    cls = 'bfc-cal__c'
    if c['provisional']:
        cls += ' is-prov'
    if c['partial']:
        cls += ' is-part'
    ink = '#14100c' if t > 0.72 else '#f6f1e8'
    return f'<i class="{cls}" style="background:{bg};color:{ink}">{short(c["count"])}</i>'


def calendar_rows(years):
    head = '<div class="bfc-cal__row bfc-cal__head"><span></span>' + ''.join(f'<b>{m}</b>' for m in MONTHS) + '</div>'
    rows = ''.join(
        f'<div class="bfc-cal__row"><span>{y}</span>' + ''.join(cell(y, m) for m in range(1, 13)) + '</div>' for y in years)
    return head + rows


cards = A['cards']

# ---------- hero window: cards beside the newest years of the calendar ----------
hero_window = f'''
<div class="ly-piece ui bfc-win" aria-hidden="true">
  <div class="bfc-win__bar"><span class="bfc-win__dots"><i></i><i></i><i></i></span><span><b>Pantanal</b> · burning calendar</span><span class="bfc-sp"></span><span class="bfc-win__src">NASA FIRMS · MODIS + VIIRS</span></div>
  <div class="bfc-win__body">
    <div class="bfc-kpis">
      <div class="bfc-kpi bfc-kpi--hot"><small>{MONTHS_LONG[cards['ref_month'] - 1]} {cards['ref_year']}, first {cards['days_covered']} days</small><strong>{cards['count']}</strong><span>corrected fire-days</span></div>
      <div class="bfc-kpi"><small>vs the 2003 to 2025 average</small><strong class="bfc-up">▲ {round(cards['vs_avg_pct'])}%</strong><span>same days, other years</span></div>
    </div>
    <div class="bfc-cal">{calendar_rows(range(2025, 2017, -1))}</div>
  </div>
</div>'''

# ---------- app frame: the years list beside the open month on the map ----------
SEL_Y, SEL_M = 2020, 9
rows = []
for y in range(2026, 2002, -1):
    r = yearly[y]
    peak_m = max(range(1, 13), key=lambda m: cal[(y, m)]['count'] if (y, m) in cal else -1)
    chip = '<span class="bfc-chip bfc-chip--prov">Provisional</span>' if r['provisional'] else '<span class="bfc-chip">Final</span>'
    on = ' is-on' if y == SEL_Y else ''
    rows.append(f'<div class="bfc-yr{on}"><b>{y}</b><span>{fmt(r["count"])} fire-days · peak {MONTHS[peak_m - 1]}</span>{chip}</div>')

sel = cal[(SEL_Y, SEL_M)]
W, Hh = 1000, 560
west, south, east, north = -58.5, -22.0, -55.0, -15.5


def px(lon, lat):
    # equirectangular inside the Pantanal box, padded
    x = 40 + (lon - west) / (east - west) * (W - 80) * 0.62 + (W - 80) * 0.19
    y = 30 + (north - lat) / (north - south) * (Hh - 60)
    return x, y


def frp_col(f):
    return '#bc3754' if f >= 150 else '#e45a31' if f >= 50 else '#f98e09' if f >= 10 else '#f9cb35'


pts = []
for f in H['features']:
    lon, lat = f['geometry']['coordinates']
    x, y = px(lon, lat)
    c = frp_col(f['properties']['frp'])
    pts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{c}"/>')
x0, y0 = px(west, north)
x1, y1 = px(east, south)
svg = (f'<svg class="bfc-map" viewBox="0 0 {W} {Hh}" preserveAspectRatio="xMidYMin slice" aria-hidden="true">'
       f'<defs><radialGradient id="bfc-glow"><stop offset="0" stop-color="#f98e09" stop-opacity=".45"/><stop offset="1" stop-color="#f98e09" stop-opacity="0"/></radialGradient></defs>'
       f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{x1 - x0:.1f}" height="{y1 - y0:.1f}" class="bfc-map__box"/>'
       + ''.join(p.replace('r="5"', 'r="16"').replace('fill="#', 'fill="url(#bfc-glow)" data-c="#') for p in pts[::3])
       + ''.join(pts) + '</svg>')

app_frame = f'''
<div class="ui app fill bfc-app" role="img" aria-label="The fire calendar app: a list of years for the Pantanal with 2020 open, and September 2020 on the map with {H['returned']} of {fmt(H['total'])} hotspots">
  <div class="app__pane app__pane--list">
    <div class="bfc-pane-head"><b>Pantanal</b><span>24 years · {fmt(A['query']['area_km2'])} km²</span></div>
    <div class="bfc-yrs">{''.join(rows)}</div>
  </div>
  <div class="app__pane app__pane--open">
    <div class="bfc-pane-head"><b>{MONTHS_LONG[SEL_M - 1]} {SEL_Y}</b><span>Showing {H['returned']} of {fmt(H['total'])} hotspots</span></div>
    <div class="bfc-stats">
      <div><small>Corrected fire-days</small><strong>{fmt(sel['count'])}</strong></div>
      <div><small>vs average</small><strong class="bfc-up">▲ {round(sel['vs_avg_pct'])}%</strong></div>
      <div><small>Rank</small><strong>{ordinal(sel['rank'])} <em>of {sel['of_years']}</em></strong></div>
      <div><small>Raw hotspots, NOAA-20</small><strong>{fmt(sel['detected']['viirs_noaa20'])}</strong></div>
    </div>
    {svg}
  </div>
</div>'''

# ---------- satellites timeline (facts from the README) ----------
Y0, Y1 = 2000, 2027


def pos(year_frac):
    return (year_frac - Y0) / (Y1 - Y0) * 100


lanes = [
    ('MODIS Terra', '1 km', 2000 + 10 / 12, 2026 + 10.5 / 12, '#56b4e9', 'Nov 2000 to today', True),
    ('MODIS Aqua', '1 km', 2002 + 6 / 12, 2026 + 10.5 / 12, '#2b8fd6', 'Jul 2002 to today', True),
    ('VIIRS S-NPP', '375 m', 2012 + 0.6 / 12, 2026 + 10 / 12, '#e8789f', 'Jan 2012 to 2 Nov 2026', False),
    ('VIIRS NOAA-20', '375 m', 2018 + 3 / 12, 2026 + 10.5 / 12, '#f0b44c', 'Apr 2018 to today', True),
]
lane_html = ''.join(
    f'<div class="bfc-lane"><div class="bfc-lane__name"><b>{n}</b><span>{px_}</span></div>'
    f'<div class="bfc-lane__track"><i class="bfc-lane__bar{"" if live else " is-ended"}" style="left:{pos(a):.2f}%;width:{pos(b) - pos(a):.2f}%;background:{c}"></i>'
    f'<em style="left:{pos(a):.2f}%">{lab}</em></div></div>' for n, px_, a, b, c, lab, live in lanes)
ticks = ''.join(f'<span style="left:{pos(y):.2f}%">{y}</span>' for y in (2003, 2012, 2018, 2026))
timeline = f'''
<div class="bfc-tl" role="img" aria-label="Satellite coverage: MODIS Terra from November 2000, MODIS Aqua from July 2002, VIIRS S-NPP from January 2012 to 2 November 2026, VIIRS NOAA-20 from April 2018. The calendar starts in January 2003.">
  <div class="bfc-tl__start" style="left:calc(var(--lane-name) + (100% - var(--lane-name)) * {pos(2003) / 100:.4f})"><span>Calendar starts, Jan 2003</span></div>
  {lane_html}
  <div class="bfc-tl__axis"><div></div><div class="bfc-tl__ticks">{ticks}</div></div>
</div>'''

# ---------- step panels (live HTML) ----------
grid_cells = []
import random
random.seed(4)
hot = {(1, 1), (1, 2), (2, 2), (3, 4), (4, 1), (4, 4), (5, 3)}
for r in range(6):
    for c in range(7):
        on = (r, c) in hot
        dots = ''.join(f'<i style="left:{random.randint(18, 78)}%;top:{random.randint(18, 78)}%"></i>' for _ in range(random.randint(2, 5))) if on else ''
        grid_cells.append(f'<span class="{"is-on" if on else ""}">{dots}</span>')
step1 = f'''<div class="ui bfc-step bfc-step--grid" aria-hidden="true"><div class="bfc-grid">{''.join(grid_cells)}</div><div class="bfc-step__note"><b>{sum(1 for x in hot)}</b> fire-days from <b>23</b> hotspots</div></div>'''

step2 = '''<div class="ui bfc-step bfc-step--conv" aria-hidden="true">
  <div class="bfc-conv"><span style="--c:#56b4e9">MODIS Terra</span><span style="--c:#2b8fd6">MODIS Aqua</span><span style="--c:#e8789f">VIIRS S-NPP</span><span style="--c:#f0b44c">VIIRS NOAA-20</span></div>
  <div class="bfc-conv__arrow"></div>
  <div class="bfc-conv__out">NOAA-20 scale</div>
</div>'''

prov_cells = ''.join(cell(2026, m) for m in range(1, 13))
step3 = f'''<div class="ui bfc-step bfc-step--prov" aria-hidden="true">
  <div class="bfc-cal bfc-cal--one"><div class="bfc-cal__row bfc-cal__head"><span></span>{''.join(f'<b>{m}</b>' for m in MONTHS)}</div><div class="bfc-cal__row"><span>2026</span>{prov_cells}</div></div>
  <ul class="bfc-keys"><li><i class="k-final"></i>Final</li><li><i class="k-prov"></i>Provisional, after 31 May 2026</li><li><i class="k-part"></i>Month not finished</li></ul>
</div>'''

SATS = ['modis_terra', 'modis_aqua', 'viirs_snpp', 'viirs_noaa20']
SC = {'modis_terra': '#56b4e9', 'modis_aqua': '#2b8fd6', 'viirs_snpp': '#e8789f', 'viirs_noaa20': '#f0b44c'}
yrs = [r for r in A['yearly'] if r['complete']]
rawmax = max(sum(v or 0 for v in r['detected'].values()) for r in yrs)
cmax = max(r['count'] for r in yrs)
bars = ''
for r in yrs:
    segs = ''.join(f'<i style="height:{(r["detected"][k] or 0) / rawmax * 100:.2f}%;background:{SC[k]}"></i>' for k in SATS)
    bars += f'<div class="bfc-yb"><div class="bfc-yb__raw">{segs}</div><b style="bottom:{r["count"] / cmax * 100:.2f}%"></b><span>{"" if r["year"] % 5 else r["year"]}</span></div>'
stmt_chart = f'''<div class="bfc-rc" role="img" aria-label="Raw hotspots per year jump when VIIRS arrives in 2012 and 2018; corrected fire-days per year stay on one scale. Pantanal, 2003 to 2025.">
  <div class="bfc-rc__plot">{bars}</div>
  <ul class="bfc-rc__key"><li><i style="background:#56b4e9"></i>MODIS</li><li><i style="background:#e8789f"></i>VIIRS S-NPP</li><li><i style="background:#f0b44c"></i>VIIRS NOAA-20</li><li><i class="k-line"></i>Corrected fire-days</li></ul>
</div>'''

tpl = (Path(__file__).parent / 'index.template.html').read_text()
out = (tpl.replace('{{HERO_WINDOW}}', hero_window)
       .replace('{{APP_FRAME}}', app_frame)
       .replace('{{TIMELINE}}', timeline)
       .replace('{{STMT_CHART}}', stmt_chart).replace('{{STEP1}}', step1).replace('{{STEP2}}', step2).replace('{{STEP3}}', step3))
(WEB / 'public/index.html').write_text(out)
print('wrote', WEB / 'public/index.html', len(out), 'bytes')
