# 한 경로를 열어 글자와 스크린샷을 남긴다. 사용: python ui-probe.py /path [email]
import importlib.util, os, sys
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('uilib', os.path.join(os.path.dirname(__file__), 'ui-lib.py'))
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)

path = sys.argv[1] if len(sys.argv) > 1 else '/'
email = sys.argv[2] if len(sys.argv) > 2 else 'ui-qa-main@graego.local'
u = lib.User(email)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = lib.context(b, u)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.on('console', lambda m: errs.append('console ' + m.text[:200]) if m.type == 'error' else None)
    pg.goto(lib.BASE + path)
    pg.wait_for_timeout(6000)
    print(pg.url)
    print(lib.visible_text(pg)[:1500])
    pg.screenshot(path=os.path.join(os.environ.get('TEMP', '.'), 'ui-probe.png'))
    b.close()
print('ERRS', errs[:10])
