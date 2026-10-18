# MP 7.7-2, 7.7-3: 큰 글자(글자 1.5배 대용), 본문 대비, 아이콘 버튼 접근성 이름, 달력 상태 표시.
# 사용: python ui-checks.py   결과: docs/화면상태/large-text/*.png 와 표준 출력 요약, 접근성 스냅샷(UI_META 폴더)
import importlib.util, json, os, sys
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('uilib', os.path.join(os.path.dirname(__file__), 'ui-lib.py'))
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)
META = os.environ.get('UI_META', os.path.join(os.environ.get('TEMP', '.'), 'ui-meta'))
LARGE = os.path.join(lib.OUT, 'large-text')
os.makedirs(LARGE, exist_ok=True)
U = lib.User('ui-qa-check@graego.local')

SCALE_JS = r"""
(k) => {
  for (const e of document.querySelectorAll('div[dir=auto], input, textarea')) {
    const cs = getComputedStyle(e);
    const fs = parseFloat(cs.fontSize);
    e.style.fontSize = (fs * k) + 'px';
    if (cs.lineHeight.endsWith('px')) e.style.lineHeight = (parseFloat(cs.lineHeight) * k) + 'px';
  }
}
"""

BTN_JS = r"""
() => {
  const out = [];
  for (const b of document.querySelectorAll('[role=button]')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height < 44 || r.bottom < 0 || r.top > innerHeight) continue;
    const bg = getComputedStyle(b).backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)') continue;
    for (const t of b.querySelectorAll('div[dir=auto]')) {
      const tr = t.getBoundingClientRect();
      if (!t.innerText.trim()) continue;
      out.push({ text: t.innerText.trim(), btn: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        txt: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.right), Math.round(tr.bottom)],
        inside: tr.left >= r.left - 1 && tr.right <= r.right + 1 && tr.top >= r.top - 1 && tr.bottom <= r.bottom + 1,
        cut: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 2, lines: Math.round(tr.height / parseFloat(getComputedStyle(t).lineHeight || 20)) });
    }
  }
  return { buttons: out, scrollW: document.documentElement.scrollWidth, w: innerWidth };
}
"""

CONTRAST_JS = r"""
() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (e) => {
    const layers = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pairs = {};
  for (const e of document.querySelectorAll('div[dir=auto]')) {
    const r = e.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(e);
    if (Number(cs.opacity) === 0) continue;
    let fg = parse(cs.color); const bg = bgOf(e);
    if (fg.a < 1) fg = over(fg, bg);
    const fs = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700 || /Bold|Black|SemiBold|Medium/.test(cs.fontFamily);
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const k = `${cs.color}|rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`;
    const rt = Math.round(ratio(fg, bg) * 100) / 100;
    if (!pairs[k] || pairs[k].fs > fs) pairs[k] = { fg: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio: rt, fs, large, sample: e.innerText.trim().slice(0, 30) };
  }
  return Object.values(pairs).sort((a, b) => a.ratio - b.ratio);
}
"""

ICON_JS = r"""
() => [...document.querySelectorAll('[role=button],[role=link],[role=tab],[role=radio],[role=checkbox]')].filter((b) => {
  const r = b.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
}).map((b) => ({ text: (b.innerText || '').trim(), label: b.getAttribute('aria-label'), role: b.getAttribute('role') }))
  .filter((b) => !/[가-힣A-Za-z]{2,}/.test(b.text))
"""


def setup_nag():
    U.reset(); g = U.goal(start_off=-40); U.day(g, -1, 'done', 900); U.day(g, -2, 'done', 900); return g


def setup_learn(secs):
    U.reset(); g = U.goal(start_off=-35, target=10, first=-2)
    U.day(g, -1, 'done', 600, target=10, started_min=60 * 24 + 30)
    for kind, base, ko in [('word', 'receipt', '영수증'), ('word', 'instead', '대신에')]:
        iid = U.item(g, kind, base, ko, off=-1)
        lib.sql(f"update public.items set next_due_day = {lib.TODAY} where id='{iid}'")
    if secs >= 480:
        lib.sql(f"update public.items set first_day = {lib.TODAY} where user_id='{U.uid}' and base='receipt'")
    ph = 'A' if secs < 120 else 'B' if secs < 480 else 'C'
    U.day(g, 0, 'progress', secs, reason='어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다', phase=ph, started_min=30, target=10)


def setup_archive():
    U.reset(); g = U.goal(start_off=90, first=-6, weekdays='{1,2,3,4,5}')
    for off, st in [(-6, 'done'), (-5, 'failed'), (-4, 'coupon'), (-1, 'done')]:
        U.day(g, off, st, 900 if st == 'done' else 0, reason='출장이 다음 주라서' if st == 'done' else None, started_min=60 * 24 * -off + 30)


SCREENS = [
    ('home-nag', setup_nag, '/'),
    ('home-waiting', lambda: (U.reset(), U.goal(start_off=90)), '/'),
    ('learn-a', lambda: setup_learn(30), '/session/learn'),
    ('learn-b', lambda: setup_learn(200), '/session/learn'),
    ('learn-c', lambda: setup_learn(500), '/session/learn'),
    ('reason', lambda: (U.reset(), U.goal(start_off=-5)), '/session/reason'),
    ('goal-new', lambda: U.reset(), '/goal/new'),
    ('settings', lambda: (U.reset(), U.goal(start_off=90)), '/settings'),
    ('settings-goal', lambda: (U.reset(), U.goal(start_off=90)), '/settings/goal'),
    ('giveup', lambda: (U.reset(), U.goal(start_off=90)), '/settings/giveup'),
    ('archive', setup_archive, '/archive'),
    ('auth', None, '/auth'),
]

res = {'large': {}, 'contrast': {}, 'icons': {}}
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, setup, path in SCREENS:
        if setup:
            setup()
        user = None if name == 'auth' else U
        ctx = lib.context(b, user, 390, 844)
        pg = ctx.new_page()
        pg.goto(lib.BASE + path); pg.wait_for_timeout(8000 if name.startswith('learn') else 5000)
        pg.evaluate("document.querySelectorAll('#error-toast').forEach(e => e.remove())")
        res['contrast'][name] = pg.evaluate(CONTRAST_JS)
        res['icons'][name] = pg.evaluate(ICON_JS)
        open(os.path.join(META, f'aria-{name}.yml'), 'w', encoding='utf-8').write(pg.locator('body').aria_snapshot())
        pg.evaluate(SCALE_JS, 1.5); pg.wait_for_timeout(600)
        pg.evaluate("document.querySelectorAll('#error-toast').forEach(e => e.remove())")
        pg.screenshot(path=os.path.join(LARGE, f'{name}-150.png'))
        res['large'][name] = pg.evaluate(BTN_JS)
        ctx.close()
    b.close()

json.dump(res, open(os.path.join(META, 'checks.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('## 큰 글자 1.5배: 채운 버튼 글자')
for n, d in res['large'].items():
    bad = [x for x in d['buttons'] if not x['inside'] or x['cut']]
    print(f"- {n}: buttons={[x['text'] for x in d['buttons']]} bad={bad} overflowX={d['scrollW'] > d['w']}")
print('## 대비 4.5 미만(큰 글자는 3 미만)')
for n, pairs in res['contrast'].items():
    for x in pairs:
        if x['ratio'] < (3 if x['large'] else 4.5):
            print(f"- {n}: {x['ratio']} fg={x['fg']} bg={x['bg']} fs={x['fs']} '{x['sample']}'")
print('## 아이콘만 있는 버튼')
for n, lst in res['icons'].items():
    for x in lst:
        print(f"- {n}: text={x['text']!r} label={x['label']!r} role={x['role']}")
