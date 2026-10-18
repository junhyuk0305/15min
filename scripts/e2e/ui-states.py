# MP 7.4-7: 모든 라우트 x 다섯 상태를 DB 주입과 네트워크 가로채기로 띄워 docs/화면상태/에 찍는다.
# 사용: python ui-states.py [시나리오 이름 ...]   (없으면 전부)
# 화면마다 버튼 위치, 크기, 색, 글자를 scratch 메타(JSON)로 남긴다. ui-report.py가 그것으로 표를 만든다.
import importlib.util, json, os, sys, time
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('uilib', os.path.join(os.path.dirname(__file__), 'ui-lib.py'))
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)

META = os.environ.get('UI_META', os.path.join(os.environ.get('TEMP', '.'), 'ui-meta'))
os.makedirs(META, exist_ok=True)
os.makedirs(lib.OUT, exist_ok=True)
W, H = int(os.environ.get('UI_W', 390)), int(os.environ.get('UI_H', 844))
SUFFIX = os.environ.get('UI_SUFFIX', '')
ERRS = []

MAIN = lib.User('ui-qa-main@graego.local')
LEARN = lib.User('ui-qa-learn@graego.local')
SUSP = lib.User('ui-qa-susp@graego.local')
BAN = lib.User('ui-qa-ban@graego.local')

DOM_JS = r"""
() => {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const cx = Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1);
    if (r.bottom < 0 || r.top > innerHeight) return 'offscreen';
    const top = document.elementFromPoint(cx, cy);
    return !!top && (top === e || e.contains(top) || top.contains(e));
  };
  const out = [];
  for (const e of document.querySelectorAll('[role=button],[role=radio],[role=checkbox],[role=tab],[role=link],a[href],button')) {
    const v = vis(e);
    if (!v) continue;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const t = e.querySelector('div[dir=auto]') || e;
    const tcs = getComputedStyle(t);
    out.push({ name: (e.innerText || '').trim().replace(/\s+/g, ' '), label: e.getAttribute('aria-label'), role: e.getAttribute('role') || e.tagName.toLowerCase(),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor,
      bw: cs.borderTopWidth, bc: cs.borderTopColor, deco: tcs.textDecorationLine, color: tcs.color, fs: tcs.fontSize, ff: tcs.fontFamily,
      disabled: e.getAttribute('aria-disabled') === 'true', offscreen: v === 'offscreen' });
  }
  // 글자가 화면 밖으로 나가거나 잘리는 요소
  const clipped = [];
  for (const e of document.querySelectorAll('div[dir=auto], input, textarea')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden') continue;
    if (r.right > innerWidth + 1 || r.left < -1) clipped.push({ kind: 'outside', text: (e.innerText || e.value || '').slice(0, 40), l: Math.round(r.left), r: Math.round(r.right) });
    else if (e.scrollWidth > e.clientWidth + 2 && cs.overflow !== 'visible' && e.tagName === 'DIV' && (e.innerText || '').length) clipped.push({ kind: 'scroll', text: e.innerText.slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth });
  }
  return { buttons: out, clipped, scrollW: document.documentElement.scrollWidth, text: document.body.innerText };
}
"""


def capture(pg, name, note='', wait=900):
    pg.wait_for_timeout(wait)
    # 개발 빌드 전용 오류 토스트(console.error)는 앱 화면이 아니라 지운다
    pg.evaluate("document.querySelectorAll('#error-toast').forEach(e => e.remove())")
    fname = name + SUFFIX
    pg.screenshot(path=os.path.join(lib.OUT, fname + '.png'))
    d = pg.evaluate(DOM_JS)
    d.update({'name': fname, 'url': pg.url, 'note': note, 'w': W, 'h': H})
    json.dump(d, open(os.path.join(META, fname + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    filled = [b['name'] or b['label'] for b in d['buttons'] if b['h'] >= 48 and b['bg'] not in ('rgba(0, 0, 0, 0)', 'transparent') and not b['offscreen']]
    print(f"== {fname} | {pg.url.replace(lib.BASE, '')} | filled={filled} | {d['text'][:260].replace(chr(10), ' / ')}")
    if d['scrollW'] > W:
        print('   !! horizontal overflow', d['scrollW'])
    for c in d['clipped'][:5]:
        print('   !! clipped', c)


def page(b, user, path='/', wait=4500, onboarded=True, ctx_kw=None):
    ctx = lib.context(b, user, W, H, onboarded=onboarded, **(ctx_kw or {}))
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: ERRS.append(f'{path} pageerror {str(e)[:200]}'))
    pg.on('console', lambda m: ERRS.append(f'{path} console {m.text[:200]}') if m.type == 'error' else None)
    if path is not None:
        pg.goto(lib.BASE + path)
        pg.wait_for_timeout(wait)
    return ctx, pg


def go(pg, path, wait=3000):
    """같은 탭 안에서 경로를 바꾼다(캐시 유지)"""
    pg.evaluate(f"window.history.pushState(null, '', {json.dumps(path)}); window.dispatchEvent(new PopStateEvent('popstate'))")
    pg.wait_for_timeout(wait)


def click(pg, name, exact=True, wait=1500):
    pg.get_by_role('button', name=name, exact=exact).last.click()
    pg.wait_for_timeout(wait)


# ---------- DB 상태 ----------
U = MAIN


def s_none():
    U.reset()


def s_waiting(prev_days=1):
    U.reset(); g = U.goal(start_off=90)
    for i in range(1, prev_days + 1):
        U.day(g, -i, 'done', 900, started_min=60 * 24 * i + 30)
    return g


def s_nag():
    U.reset(); g = U.goal(start_off=-40)
    U.day(g, -1, 'done', 900); U.day(g, -2, 'done', 900)
    return g


def full_day(g, off, reason, u=None):
    u = u or U
    u.day(g, off, 'done', active=900, reason=reason, phase='retro', started_min=60 * 24 * -off + 30, retro=180)
    u.msg(g, off, 'A', 'coach', '카페에서 우유를 바꿔 달라고 할 때 뭐라고 합니까?', '{"quiz":{"index":0,"type":"situation"}}', 1)
    u.msg(g, off, 'A', 'user', 'Can I change the milk?', '{}', 2)
    u.msg(g, off, 'A', 'coach', '뜻은 통합니다. instead를 붙이면 더 자연스럽습니다.', '{"quiz_grade":{"correct":true}}', 3)
    u.msg(g, off, 'B', 'partner', 'Hi! What can I get for you today?', '{}', 4)
    u.msg(g, off, 'B', 'user', 'I want order latte.', '{}', 5)
    u.msg(g, off, 'B', 'coach', '주문할 때는 I would like를 씁니다.',
          '{"modal":{"expression":{"en":"I would like …","ko":"…로 주세요","note":"정중하게 주문할 때 씁니다."},"words":[{"en":"order","ko":"주문하다","note":""}]}}', 6)
    u.msg(g, off, 'B', 'partner', 'Sure. Hot or iced?', '{}', 7)
    u.msg(g, off, 'B', 'user', 'Iced, please. Could I have oat milk instead?', '{}', 8)
    u.msg(g, off, 'C', 'coach', 'instead의 뜻을 고르십시오.', '{"quiz":{"index":0,"type":"meaning_choice"}}', 9)
    u.msg(g, off, 'C', 'user', '대신에', '{}', 10)
    u.msg(g, off, 'retro', 'coach', 'What did you learn today?', '{"retro_q":1}', 11)
    u.msg(g, off, 'retro', 'user', 'I learned to say instead. Tomorrow I will ask for sizes.', '{"retro_q":1}', 12)


def s_archive3():
    U.reset(); g = U.goal(start_off=90, first=-5)
    full_day(g, -5, '출장이 다음 주라서 더는 미룰 수 없어서')
    U.day(g, -4, 'failed', reason=None)
    U.day(g, -3, 'coupon', reason=None)
    full_day(g, -2, '회의에서 말 한마디 못 한 게 분해서')
    full_day(g, -1, '오늘은 사이즈를 바꿔 보려고 합니다')
    for kind, base, ko in [('word', 'receipt', '영수증'), ('word', 'instead', '대신에'), ('expression', 'I would like …', '…로 주세요')]:
        U.item(g, kind, base, ko, off=-2)
    return g


SC = {}


def sc(fn):
    SC[fn.__name__] = fn
    return fn


# ---------- 홈 ----------
HOME_STATES = {
    'none': lambda: s_none(),
    'before_first': lambda: (U.reset(), U.goal(start_off=-120, first=1)),
    'rest': lambda: (U.reset(), U.goal(weekdays='{%s}' % ','.join(str(d) for d in range(7) if d != (time.localtime().tm_wday + 1) % 7))),
    'waiting': lambda: s_waiting(),
    'failed_yesterday': lambda: (lambda g: (U.day(g, -2, 'done', 900), U.day(g, -1, 'failed', reason=None)))(U.goal(start_off=90)) if not U.reset() else None,
    'soon': lambda: (U.reset(), U.goal(start_off=8)),
    'grace': lambda: (U.reset(), U.goal(start_off=-5)),
    'nag': lambda: s_nag(),
    'resume': lambda: (lambda g: U.day(g, 0, 'progress', 300, phase='A', started_min=10))(U.goal(start_off=-40)) if not U.reset() else None,
    'done': lambda: (lambda g: full_day(g, 0, '오늘은 사이즈를 바꿔 보려고 합니다'))(U.goal(start_off=-120)) if not U.reset() else None,
    'coupon': lambda: (lambda g: U.day(g, 0, 'coupon', reason=None))(U.goal(start_off=-40, coupons=2)) if not U.reset() else None,
    'giveup': lambda: (lambda g: (U.day(g, -1, 'done', 900), U.day(g, -2, 'done', 900)))(U.goal(start_off=-40, giveup_h=5)) if not U.reset() else None,
    'achieve_ready': lambda: (lambda g: [U.day(g, -i, 'done', 900) for i in range(1, 15)])(U.goal(start_off=90, first=-14, period=14)) if not U.reset() else None,
}


@sc
def home_normal(b):
    only = os.environ.get('HOME_ONLY', '').split(',') if os.environ.get('HOME_ONLY') else None
    for st, setup in HOME_STATES.items():
        if only and st not in only:
            continue
        setup()
        ctx, pg = page(b, U, '/')
        capture(pg, 'home-empty' if st == 'none' else f'home-normal-{st}')
        ctx.close()


@sc
def home_loading(b):
    s_nag()
    # 1) 캐시 없는 첫 시작: 서버가 답하지 않는 동안
    ctx, pg = page(b, U, None)
    hold = lib.Hold(pg)
    pg.goto(lib.BASE + '/'); pg.wait_for_timeout(2500)
    capture(pg, 'home-loading', '캐시 없음, 첫 읽기 대기 2.5초 (웹은 스플래시 없음)')
    pg.wait_for_timeout(9000)
    capture(pg, 'home-loading-10s', '첫 읽기 10초 초과')
    hold.release(); ctx.close()
    # 2) 캐시 있음: 새로고침 중
    ctx, pg = page(b, U, '/')
    hold = lib.Hold(pg)
    pg.reload(); pg.wait_for_timeout(2500)
    capture(pg, 'home-loading-cache', '캐시 있음, 새로 읽기 대기 2.5초')
    hold.release(); ctx.close()


@sc
def home_error(b):
    s_nag()
    ctx, pg = page(b, U, '/')
    lib.fail_server(pg)
    pg.reload(); pg.wait_for_timeout(4000)
    capture(pg, 'home-error', '캐시 있음, 서버 500')
    ctx.close()
    ctx, pg = page(b, U, None)
    lib.fail_server(pg)
    pg.goto(lib.BASE + '/'); pg.wait_for_timeout(5000)
    capture(pg, 'home-error-cold', '캐시 없음, 서버 500')
    ctx.close()


@sc
def home_offline(b):
    s_nag()
    ctx, pg = page(b, U, '/')
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(4000)
    capture(pg, 'home-offline', '캐시 있음, 네트워크 끊김 (독촉)')
    ctx.close()
    # 포기 대기 중 오프라인: 철회 버튼과 실패 문장
    HOME_STATES['giveup']()
    ctx, pg = page(b, U, '/')
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(4000)
    click(pg, '포기 철회하기', wait=2500)
    capture(pg, 'home-offline-giveup', '포기 대기 + 오프라인에서 철회 누름')
    ctx.close()


@sc
def home_giveup_end(b):
    # 마감 20초 전에 열어 두고 마감을 넘긴다. 홈이 마감에 다시 읽어 반성문 화면으로 가는지 본다
    U.reset(); g = U.goal(start_off=-40)
    U.day(g, -1, 'done', 900); U.day(g, -2, 'done', 900)
    lib.sql(f"update public.goals set giveup_requested_at = now() - interval '24 hours' + interval '24 seconds' where id='{g}'")
    t0 = time.time()
    ctx, pg = page(b, U, '/', 4000)
    capture(pg, 'home-normal-giveup-end', '포기 마감 약 20초 전')
    pg.wait_for_timeout(max(0, int((t0 + 24 - time.time()) * 1000)) + 4000)
    capture(pg, 'home-giveup-ended', '마감 지나고 4초(자동 다시 읽기)')
    ctx.close()
    # 마감 직후 다시 읽기 전에 철회를 누른 경우
    U.reset(); g = U.goal(start_off=-40)
    U.day(g, -1, 'done', 900)
    lib.sql(f"update public.goals set giveup_requested_at = now() - interval '24 hours' + interval '10 seconds' where id='{g}'")
    t0 = time.time()
    ctx, pg = page(b, U, '/', 4000)
    pg.wait_for_timeout(max(0, int((t0 + 10.2 - time.time()) * 1000)))
    pg.get_by_role('button', name='포기 철회하기').last.click()
    capture(pg, 'home-giveup-withdraw-late', '마감 0.2초 뒤 철회 누름', wait=500)
    pg.wait_for_timeout(3000)
    capture(pg, 'home-giveup-withdraw-late-after', '그 뒤 3초')
    ctx.close()


# ---------- 기록 ----------
@sc
def archive_states(b):
    s_archive3()
    ctx, pg = page(b, U, '/')
    hold = lib.Hold(pg, '/rest/v1/messages')
    go(pg, '/archive', 2500)
    capture(pg, 'archive-loading', '글자 수 읽기 대기')
    hold.release(); pg.wait_for_timeout(2500)
    capture(pg, 'archive-normal')
    pg.mouse.wheel(0, 900); pg.wait_for_timeout(500)
    capture(pg, 'archive-normal-scrolled')
    ctx.close()
    ctx, pg = page(b, U, '/archive')
    lib.fail_server(pg)
    pg.reload(); pg.wait_for_timeout(4500)
    capture(pg, 'archive-error', '서버 500')
    ctx.close()
    ctx, pg = page(b, U, '/archive')
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(4500)
    capture(pg, 'archive-offline')
    ctx.close()
    s_waiting(0)
    ctx, pg = page(b, U, '/archive')
    capture(pg, 'archive-empty', '목표 있음, 기록 없음')
    ctx.close()
    s_none()
    ctx, pg = page(b, U, '/archive')
    capture(pg, 'archive-empty-nogoal', '목표 없음')
    ctx.close()


@sc
def archive_detail(b):
    g = s_archive3()
    ctx, pg = page(b, U, '/archive', 5000)
    hold = lib.Hold(pg, '/rest/v1/messages')
    pg.get_by_role('button').filter(has_text='회의에서').first.click()
    pg.wait_for_timeout(1500)
    capture(pg, 'archive-detail-loading', '대화 읽기 대기 1.5초')
    pg.wait_for_timeout(10000)
    capture(pg, 'archive-detail-loading-10s', '대화 읽기 10초 초과')
    hold.release(); pg.wait_for_timeout(2000)
    capture(pg, 'archive-detail-normal')
    ctx.close()
    # 오류: 대화 읽기 500
    ctx, pg = page(b, U, '/archive', 5000)
    h = lib.fail_server(pg, '/rest/v1/messages')
    pg.get_by_role('button').filter(has_text='회의에서').first.click()
    capture(pg, 'archive-detail-error', '대화 읽기 500', wait=2500)
    ctx.close()
    # 오프라인: 캐시 대화 + 배너
    ctx, pg = page(b, U, '/archive', 5000)
    pg.get_by_role('button').filter(has_text='회의에서').first.click(); pg.wait_for_timeout(2500)
    url = pg.url
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(5000)
    capture(pg, 'archive-detail-offline', '캐시 대화 + 끊김')
    pg.wait_for_timeout(12000)
    capture(pg, 'archive-detail-offline-15s', '캐시 대화 + 끊김 15초 뒤')
    ctx.close()
    # 빈: 대화 없는 날, 없는 카드
    lib.sql(f"delete from public.messages where user_id='{U.uid}' and day = {lib.TODAY} - 2")
    ctx, pg = page(b, U, '/archive', 5000)
    pg.get_by_role('button').filter(has_text='회의에서').first.click()
    capture(pg, 'archive-detail-empty', '대화 없음', wait=2500)
    go(pg, '/archive/nope-key', 2500)
    capture(pg, 'archive-detail-notfound', '없는 카드')
    ctx.close()


# ---------- 설정 ----------
@sc
def settings_tab(b):
    s_waiting()
    ctx, pg = page(b, U, '/settings')
    capture(pg, 'settings-normal')
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(4500)
    capture(pg, 'settings-offline', '캐시 + 끊김')
    ctx.close()
    ctx, pg = page(b, U, '/settings')
    lib.fail_server(pg, '/auth/v1/logout')
    pg.get_by_role('button', name='로그아웃').click(); pg.wait_for_timeout(1200)
    capture(pg, 'settings-logout-confirm', '로그아웃 확인 시트(U6)')
    click(pg, '로그아웃하기', wait=3000)
    capture(pg, 'settings-error', '로그아웃 요청 500')
    ctx.close()
    s_none()
    ctx, pg = page(b, U, '/settings')
    capture(pg, 'settings-empty', '목표 없음')
    ctx.close()
    # 계정 삭제 확인 창과 실패
    ctx, pg = page(b, U, '/settings')
    lib.fail_server(pg, '/functions/v1/delete-account')
    pg.get_by_role('button', name='계정 삭제하기').first.click(); pg.wait_for_timeout(1200)
    capture(pg, 'settings-delete-confirm')
    pg.get_by_role('button', name='삭제하기').last.click() if pg.get_by_role('button', name='삭제하기').count() else None
    capture(pg, 'settings-delete-error', '계정 삭제 500', wait=2500)
    ctx.close()
    HOME_STATES['giveup']()
    ctx, pg = page(b, U, '/settings')
    pg.get_by_role('button', name='계정 삭제하기').first.click(); pg.wait_for_timeout(1200)
    capture(pg, 'settings-delete-confirm-giveup', '포기 대기 중 삭제 확인')
    ctx.close()


@sc
def settings_goal(b):
    s_waiting()
    ctx, pg = page(b, U, '/settings/goal')
    capture(pg, 'settings-goal-normal')
    pg.get_by_label('하루 학습 줄이기').click()
    click(pg, '저장하기', wait=800)
    capture(pg, 'settings-goal-shrink')
    hold = lib.Hold(pg)
    click(pg, '줄이기', wait=700)
    capture(pg, 'settings-goal-loading', '저장 요청 대기')
    hold.release(); pg.wait_for_timeout(2000)
    capture(pg, 'settings-goal-saved')
    ctx.close()
    ctx, pg = page(b, U, '/settings/goal')
    lib.fail_server(pg, '/rest/v1/rpc/change_schedule')
    pg.get_by_label('하루 학습 늘리기').click()
    click(pg, '저장하기', wait=2500)
    capture(pg, 'settings-goal-error', '저장 500')
    ctx.close()
    ctx, pg = page(b, U, '/settings/goal')
    lib.fail_network(pg)
    pg.get_by_label('하루 학습 늘리기').click()
    click(pg, '저장하기', wait=2500)
    capture(pg, 'settings-goal-offline', '저장 끊김')
    ctx.close()
    s_none()
    ctx, pg = page(b, U, '/settings/goal')
    capture(pg, 'settings-goal-empty', '목표 없음 -> 홈')
    ctx.close()


@sc
def settings_giveup(b):
    s_waiting()
    ctx, pg = page(b, U, '/settings/giveup')
    capture(pg, 'settings-giveup-normal')
    pg.mouse.wheel(0, 900)
    capture(pg, 'settings-giveup-normal-scrolled', wait=500)
    click(pg, '포기 신청하기', wait=1000)
    capture(pg, 'settings-giveup-confirm')
    lib.fail_server(pg, '/rest/v1/rpc/request_giveup')
    click(pg, '포기 신청하기', wait=2500)
    capture(pg, 'settings-giveup-error', '신청 500')
    ctx.close()
    ctx, pg = page(b, U, '/settings/giveup')
    click(pg, '포기 신청하기', wait=1300)  # U7: 2단계는 줄인 움직임에서 1초 비활성 뒤 탭
    lib.fail_network(pg)
    click(pg, '포기 신청하기', wait=2500)
    capture(pg, 'settings-giveup-offline', '신청 끊김')
    ctx.close()
    HOME_STATES['giveup']()
    ctx, pg = page(b, U, '/settings/giveup')
    capture(pg, 'settings-giveup-empty', '이미 포기 대기')
    ctx.close()


@sc
def legal(b):
    ctx, pg = page(b, U, '/settings/legal/terms')
    capture(pg, 'legal-normal-terms')
    go(pg, '/settings/legal/privacy', 2000)
    capture(pg, 'legal-normal-privacy')
    go(pg, '/settings/legal/nope', 1200)
    capture(pg, 'legal-empty', '없는 문서', wait=300)
    ctx.close()
    ctx, pg = page(b, U, '/')
    lib.fail_network(pg)
    go(pg, '/settings/legal/terms', 2000)
    capture(pg, 'legal-offline')
    ctx.close()


@sc
def crash(b):
    s_waiting()
    ctx, pg = page(b, U, '/?crash=1', 5000)
    capture(pg, 'crash-error', '렌더 오류(개발 빌드 ?crash=1)')
    if pg.get_by_role('button', name='다시 열기').count():
        click(pg, '다시 열기', wait=3000)
        capture(pg, 'crash-recovered', '다시 열기 뒤')
    ctx.close()


@sc
def not_found(b):
    s_waiting()
    ctx, pg = page(b, U, '/no-such-screen', 3500)
    capture(pg, 'not-found', '없는 경로', wait=200)
    ctx.close()


# ---------- 쿠폰, 달성 ----------
@sc
def coupon(b):
    s_nag()
    ctx, pg = page(b, U, '/')
    click(pg, '쿠폰 쓰기', wait=0); pg.wait_for_timeout(1200)
    capture(pg, 'coupon-normal')
    hold = lib.Hold(pg)
    click(pg, '쿠폰 쓰기', wait=700)
    capture(pg, 'coupon-loading', '쓰기 요청 대기')
    hold.release(); pg.wait_for_timeout(2000)
    capture(pg, 'coupon-normal-used')
    ctx.close()
    s_nag()
    ctx, pg = page(b, U, '/')
    click(pg, '쿠폰 쓰기', wait=0); pg.wait_for_timeout(1000)
    lib.fail_server(pg, '/rest/v1/rpc/use_coupon')
    click(pg, '쿠폰 쓰기', wait=2500)
    capture(pg, 'coupon-error', '쓰기 500')
    ctx.close()
    s_nag()
    ctx, pg = page(b, U, '/')
    click(pg, '쿠폰 쓰기', wait=0); pg.wait_for_timeout(1000)
    lib.fail_network(pg)
    click(pg, '쿠폰 쓰기', wait=2500)
    capture(pg, 'coupon-offline', '쓰기 끊김')
    ctx.close()
    U.reset(); g = U.goal(start_off=-40, coupons=0); U.day(g, -1, 'done', 900)
    ctx, pg = page(b, U, '/')
    click(pg, '쿠폰 쓰기', wait=0); pg.wait_for_timeout(1000)
    capture(pg, 'coupon-empty', '남은 쿠폰 없음')
    ctx.close()


@sc
def achieve(b):
    HOME_STATES['achieve_ready']()
    ctx, pg = page(b, U, '/')
    pg.get_by_text('달성 선언하기').click(); pg.wait_for_timeout(1500)
    capture(pg, 'achieve-normal-a1')
    lib.fail_server(pg, '/rest/v1/rpc/declare_achievement')
    click(pg, '달성 선언하기', wait=2500)
    capture(pg, 'achieve-error', '선언 500')
    ctx.close()
    ctx, pg = page(b, U, '/goal/achieve')
    lib.fail_network(pg)
    click(pg, '달성 선언하기', wait=2500)
    capture(pg, 'achieve-offline', '선언 끊김')
    ctx.close()
    ctx, pg = page(b, U, '/goal/achieve')
    hold = lib.Hold(pg)
    click(pg, '달성 선언하기', wait=700)
    capture(pg, 'achieve-loading', '선언 요청 대기')
    hold.release(); pg.wait_for_timeout(2500)
    capture(pg, 'achieve-normal-a2')
    ctx.close()
    s_waiting()
    ctx, pg = page(b, U, '/goal/achieve')
    capture(pg, 'achieve-empty', '기간 전')
    ctx.close()
    s_none()
    ctx, pg = page(b, U, '/goal/achieve')
    capture(pg, 'achieve-empty-nogoal', '목표 없음')
    ctx.close()


# ---------- 학습 ----------
@sc
def reason(b):
    U.reset(); g = U.goal(start_off=-5)
    ctx, pg = page(b, U, '/session/reason')
    capture(pg, 'reason-empty', '첫날, 지난 이유 없음')
    ctx.close()
    U.reset(); g = U.goal(start_off=-5); U.day(g, -1, 'done', 900, reason='출장이 다음 주라서 더는 미룰 수 없어서')
    ctx, pg = page(b, U, '/session/reason')
    capture(pg, 'reason-normal-blank', '입력 전(비활성)')
    pg.locator('textarea').first.fill('오늘은 사이즈를')
    capture(pg, 'reason-normal-short', '20자 미만')
    pg.locator('textarea').first.fill('출장이 다음 주라서 더는 미룰 수 없어서')
    capture(pg, 'reason-normal-same', '지난 이유와 같음')
    pg.locator('textarea').first.fill('어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다')
    capture(pg, 'reason-normal', '입력 후')
    lib.fail_server(pg, '/rest/v1/rpc/start_day')
    click(pg, '시작하기', wait=2500)
    capture(pg, 'reason-error', '시작 500')
    ctx.close()
    ctx, pg = page(b, U, '/session/reason')
    pg.locator('textarea').first.fill('어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다')
    lib.fail_network(pg)
    click(pg, '시작하기', wait=2500)
    capture(pg, 'reason-offline', '시작 끊김')
    ctx.close()
    ctx, pg = page(b, U, '/session/reason')
    pg.locator('textarea').first.fill('어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다')
    hold = lib.Hold(pg)
    click(pg, '시작하기', wait=700)
    capture(pg, 'reason-loading', '시작 요청 대기')
    hold.release(); ctx.close()
    # 실제 서버 거절: 시작 90분 전
    U.reset(); g = U.goal(start_off=90)
    ctx, pg = page(b, U, '/session/reason')
    pg.locator('textarea').first.fill('어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다')
    click(pg, '시작하기', wait=2500)
    capture(pg, 'reason-error-early', '서버 거절(이른 시작)')
    ctx.close()


def learn_setup(secs, items=True, target=10, retro=0, retro_started=False, phase=None):
    u = LEARN
    u.reset()
    g = u.goal(start_off=-35, target=target, first=-2)
    full_day(g, -1, '어제는 주문을 연습했습니다', u)
    if items:
        for kind, base, ko in [('expression', "Could I have … instead?", '…로 바꿔 주실 수 있습니까?'), ('word', 'receipt', '영수증'), ('word', 'instead', '대신에')]:
            iid = u.item(g, kind, base, ko, off=-1)
            lib.sql(f"update public.items set next_due_day = {lib.TODAY} where id='{iid}'")
    ph = phase or ('A' if secs < 120 else 'B' if secs < 480 else 'C' if secs < 600 else 'retro')
    u.day(g, 0, 'progress', secs, reason='어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다', phase=ph, started_min=30,
          target=target, retro=retro, retro_started=retro_started)
    return g


@sc
def learn(b):
    global U
    # A 정상
    learn_setup(30)
    ctx, pg = page(b, LEARN, None)
    hold = lib.Hold(pg, '/functions/v1/review-quiz')
    pg.goto(lib.BASE + '/session/learn'); pg.wait_for_timeout(700)
    capture(pg, 'learn-a-overlay', '단계 전환 연출(U5, 들어옴 250 + 1000 유지 + 나감 250 안)', wait=0)
    pg.wait_for_timeout(2500)
    capture(pg, 'learn-loading', 'A 문항 대기(review-quiz 붙잡음)')
    hold.release(); pg.wait_for_timeout(3000)
    capture(pg, 'learn-a-normal')
    answer = pg.locator('textarea, input')  # U4: 복습 답은 한 줄 입력(input, type 속성 없음)
    if answer.count():
        answer.last.fill('receipt')  # 문제 1 "뜻: 영수증"의 정답
        pg.wait_for_timeout(300)
        capture(pg, 'learn-a-typed', wait=0)
        click(pg, '제출하기', wait=800)
        capture(pg, 'learn-a-graded', '정답', wait=0)
    elif pg.get_by_role('radio').count():
        pg.get_by_role('radio').nth(1).click()
        click(pg, '제출하기', wait=1500)
        capture(pg, 'learn-a-graded')
    # 오답: 다시 답하기와 정답 보기 → 정답 → 다음 문제 보기
    for _ in range(4):
        pg.wait_for_timeout(2500)
        if answer.count():
            answer.last.fill('hello')
            click(pg, '제출하기', wait=1500)
        elif pg.get_by_role('radio').count():
            pg.get_by_role('radio').nth(0).click()
            click(pg, '제출하기', wait=1500)
        if pg.get_by_role('button', name='정답 보기').count():
            break
    capture(pg, 'learn-a-retry', '첫 오답(정답 숨김)', wait=0)
    if pg.get_by_role('button', name='정답 보기').count():
        click(pg, '정답 보기', wait=1500)
        capture(pg, 'learn-a-revealed', '정답 보기 뒤', wait=0)
    # A 오류: 다음 문항 502
    pg.route('**/functions/v1/review-quiz', lambda r: r.fulfill(status=502, content_type='application/json', body='{"error":"ai_failed"}') if r.request.method == 'POST' else r.continue_())
    pg.reload(); pg.wait_for_timeout(6000)
    capture(pg, 'learn-error', 'A 문항 502')
    ctx.close()
    # A 빈: 첫날(지난 항목 없음)
    LEARN.reset(); g = LEARN.goal(start_off=-35, target=10, first=0)
    LEARN.day(g, 0, 'progress', 30, reason='처음이라 긴장되지만 오늘부터 시작해 보려고 합니다', phase='A', started_min=30, target=10)
    ctx, pg = page(b, LEARN, '/session/learn', 7000)
    capture(pg, 'learn-empty', '첫날 A(지난 항목 없음)')
    ctx.close()
    # B 정상, 모달, 실패, 오프라인
    learn_setup(200)
    ctx, pg = page(b, LEARN, '/session/learn', 8000)
    capture(pg, 'learn-b-normal')
    pg.locator('textarea').last.fill('I want order a large latte.')
    click(pg, '보내기', wait=3500)
    capture(pg, 'learn-b-modal', '코치 표현 모달')
    if pg.get_by_role('button', name='닫기', exact=True).count() > 1:  # U3: 학습 화면 X도 이름이 '닫기'. 모달이 떴을 때만 모달(마지막) 닫기를 누른다
        click(pg, '닫기', wait=800)
    pg.route('**/functions/v1/lesson-turn', lambda r: r.fulfill(status=502, content_type='application/json', body='{"error":"ai_failed"}') if r.request.method == 'POST' else r.continue_())
    pg.locator('textarea').last.fill('Could I get it with oat milk?')
    click(pg, '보내기', wait=2500)
    capture(pg, 'learn-b-error', 'B 응답 502')
    ctx.close()
    learn_setup(200)
    ctx, pg = page(b, LEARN, '/session/learn', 8000)
    ctx.set_offline(True); pg.wait_for_timeout(9000)
    capture(pg, 'learn-offline', 'B 중 끊김')
    ctx.set_offline(False); pg.wait_for_timeout(9000)
    capture(pg, 'learn-offline-back', '연결 복구 뒤')
    ctx.close()
    # B 대기
    learn_setup(200)
    ctx, pg = page(b, LEARN, '/session/learn', 8000)
    hold = lib.Hold(pg, '/functions/v1/lesson-turn')
    pg.locator('textarea').last.fill('Can I get a large one?')
    click(pg, '보내기', wait=1500)
    capture(pg, 'learn-b-loading', 'B 응답 대기')
    hold.release(); ctx.close()
    # 한도 초과
    learn_setup(200)
    ctx, pg = page(b, LEARN, None)
    pg.route('**/functions/v1/lesson-turn', lambda r: r.fulfill(status=429, content_type='application/json', body='{"error":"limit"}') if r.request.method == 'POST' else r.continue_())
    pg.goto(lib.BASE + '/session/learn'); pg.wait_for_timeout(8000)
    capture(pg, 'learn-error-limit', 'B 한도 초과 429')
    ctx.close()
    learn_c(b)


@sc
def learn_c(b):
    learn_setup(500)
    lib.sql(f"update public.items set first_day = {lib.TODAY} where user_id='{LEARN.uid}' and base='receipt'")
    ctx, pg = page(b, LEARN, '/session/learn', 8000)
    capture(pg, 'learn-c-normal')
    if pg.get_by_role('radio').count():
        pg.get_by_role('radio').nth(1).click(); click(pg, '제출하기', wait=1500)
        capture(pg, 'learn-c-graded', '오답 제출 1.5초 뒤', wait=0)
        capture(pg, 'learn-c-graded-5s', '오답 제출 5초 뒤', wait=3500)
    ctx.close()
    # 딴짓 팝업은 2분 무활동 뒤라 따로 찍는다(learn_idle)


@sc
def learn_idle(b):
    learn_setup(200)
    ctx, pg = page(b, LEARN, '/session/learn', 6000)
    pg.wait_for_timeout(123000)
    capture(pg, 'learn-idle', '2분 무활동')
    ctx.close()


@sc
def retro(b):
    learn_setup(600, retro=20, retro_started=True, phase='retro')
    ctx, pg = page(b, LEARN, None)
    hold = lib.Hold(pg, '/functions/v1/retro')
    pg.goto(lib.BASE + '/session/retro'); pg.wait_for_timeout(3500)
    capture(pg, 'retro-loading', '첫 질문 대기')
    hold.release(); pg.wait_for_timeout(3500)
    capture(pg, 'retro-normal')
    pg.locator('textarea').last.fill('I asked for oat milk and a bigger size today.')
    click(pg, '보내기', wait=3500)
    capture(pg, 'retro-normal-chat')
    ctx.set_offline(True); pg.wait_for_timeout(9000)
    capture(pg, 'retro-offline')
    ctx.set_offline(False); ctx.close()
    learn_setup(600, retro=20, retro_started=True, phase='retro')
    ctx, pg = page(b, LEARN, None)
    pg.route('**/functions/v1/retro', lambda r: r.fulfill(status=502, content_type='application/json', body='{"error":"ai_failed"}') if r.request.method == 'POST' else r.continue_())
    pg.goto(lib.BASE + '/session/retro'); pg.wait_for_timeout(6000)
    capture(pg, 'retro-error', '열기 502')
    ctx.close()
    # 3분 채움 -> 완료하기, 완료 실패
    learn_setup(600, retro=180, retro_started=True, phase='retro')
    LEARN_g = lib.sql(f"select id from public.goals where user_id='{LEARN.uid}' and status='active'")
    LEARN.msg(LEARN_g, 0, 'retro', 'coach', 'What did you learn today?', '{"retro_q":1}', 1)
    LEARN.msg(LEARN_g, 0, 'retro', 'user', 'I learned how to ask for a different size.', '{"retro_q":1}', 2)
    ctx, pg = page(b, LEARN, '/session/retro', 6000)
    capture(pg, 'retro-normal-filled', '3분 채움')
    lib.fail_server(pg, '/rest/v1/rpc/complete_day')
    click(pg, '완료하기', wait=2500)
    capture(pg, 'retro-error-finish', '완료 500')
    ctx.close()


@sc
def done(b):
    def setup():
        LEARN.reset(); g = LEARN.goal(start_off=-40, target=10, first=-2)
        full_day(g, -1, '어제는 주문을 연습했습니다', LEARN)
        full_day(g, 0, '오늘은 사이즈를 바꿔 보려고 합니다', LEARN)
        lib.sql(f"update public.days set active_seconds=600, target_minutes=10 where user_id='{LEARN.uid}'")
        return g
    g = setup()
    for kind, base, ko, ev in [('word', 'receipt', '영수증', ['taught']), ('expression', 'Could I have … instead?', '…로 바꿔 주실 수 있습니까?', ['taught']),
                               ('word', 'size', '크기', ['taught'])]:
        LEARN.item(g, kind, base, ko, off=0, events=ev)
    old = LEARN.item(g, 'expression', 'I would like …', '…로 주세요', off=-1, events=['taught'])
    lib.sql(f"insert into public.item_events (id, user_id, item_id, day, phase, kind, correct, aided) values (gen_random_uuid(), '{LEARN.uid}', '{old}', {lib.TODAY}, 'A', 'quiz', true, false)")
    ctx, pg = page(b, LEARN, None)
    hold = lib.Hold(pg, '/rest/v1/item')
    pg.goto(lib.BASE + '/session/done?earned=1'); pg.wait_for_timeout(4000)
    capture(pg, 'done-loading', '성과 줄 대기')
    hold.release(); pg.wait_for_timeout(2500)
    capture(pg, 'done-normal')
    ctx.close()
    ctx, pg = page(b, LEARN, '/', 4000)
    lib.fail_server(pg, '/rest/v1/item')
    go(pg, '/session/done', 3000)
    capture(pg, 'done-error', '성과 읽기 500')
    ctx.close()
    ctx, pg = page(b, LEARN, '/', 4000)
    lib.fail_network(pg)
    go(pg, '/session/done', 3000)
    capture(pg, 'done-offline-3s', '성과 읽기 끊김 3초')
    pg.wait_for_timeout(12000)
    capture(pg, 'done-offline', '성과 읽기 끊김 15초')
    ctx.close()
    setup()
    ctx, pg = page(b, LEARN, '/session/done', 5000)
    capture(pg, 'done-empty', '성과 항목 0개')
    ctx.close()


# ---------- 목표 설정 ----------
@sc
def goal_new(b):
    s_none()
    ctx, pg = page(b, U, '/goal/new', 5000)
    capture(pg, 'goal-new-empty', '첫 질문')
    pg.locator('textarea').last.fill('출장 때문입니다')
    capture(pg, 'goal-new-short', '이유 20자 미만')
    pg.locator('textarea').last.fill('해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다')
    hold = lib.Hold(pg, '/functions/v1/goal-setup')
    click(pg, '보내기', wait=1200)
    capture(pg, 'goal-new-loading', '코치 답 대기')
    hold.release(); pg.wait_for_timeout(3000)
    capture(pg, 'goal-new-normal-chat')
    if pg.get_by_role('button', name='더 보기').count():  # U4: 헤더 ⋯ → 신고하기 → 사유 시트
        pg.get_by_role('button', name='더 보기').last.click(); pg.wait_for_timeout(800)
        capture(pg, 'goal-new-report-menu', '헤더 더 보기 시트')
        pg.get_by_role('button', name='신고하기').last.click(); pg.wait_for_timeout(1200)
        capture(pg, 'goal-new-report', '코치 답 신고 사유 시트')
        pg.get_by_role('button', name='부적절한 내용').last.click(); pg.wait_for_timeout(2000)
        capture(pg, 'goal-new-report-done', '신고 뒤')
    lib.fail_server(pg, '/functions/v1/goal-setup')
    pg.locator('textarea').last.fill('카페')
    click(pg, '보내기', wait=2500)
    capture(pg, 'goal-new-error', '채팅 500')
    ctx.close()
    ctx, pg = page(b, U, '/goal/new', 5000)
    lib.fail_network(pg)
    pg.locator('textarea').last.fill('해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다')  # 첫 답은 20자 이상
    click(pg, '보내기', wait=2500)
    capture(pg, 'goal-new-offline', '채팅 끊김')
    ctx.close()
    # 앞말이 붙은 코치 질문의 선택 칩(결함 3). 가짜 AI는 이런 문장을 내지 않아 초안에 넣는다
    for name, q in [('goal-new-chips-prefix', '말을 주고받을 상대는 바리스타, 계산대 점원, 옆자리 손님 중 누구입니까?'),
                    ('goal-new-chips-prefix2', '카페에서는 주문하는 손님이 됩니다. 바리스타, 계산대 점원, 옆자리 손님 중 누구와 말합니까?')]:
        lines = [('coach', '영어를 하려는 이유를 20자 이상 써 주십시오. 처음 이유는 나중에 바꿀 수 없습니다.'),
                 ('user', '해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다'),
                 ('coach', '분명한 이유입니다. 영어로 말할 장소는 카페, 호텔 프런트, 회의실 중 어디입니까?'),
                 ('user', '카페'), ('coach', q)]
        d = {'state': {'userId': U.uid, 'lines': [{'id': f'l{i}', 'role': r, 'text': t} for i, (r, t) in enumerate(lines)],
                       'fields': {'reason': lines[1][1], 'place': '카페', 'my_role': '손님'}, 'done': False, 'subsituations': [], 'manual': False,
                       'stage': 'chat', 'plan': {'periodDays': 14, 'weekdays': [1, 2, 3, 4, 5], 'startMinutes': 1320, 'targetMinutes': 15}}, 'version': 0}
        ctx, pg = page(b, U, None)
        pg.add_init_script("localStorage.setItem('graego-goal-setup-v1', %s)" % json.dumps(json.dumps(d)))
        pg.goto(lib.BASE + '/goal/new'); pg.wait_for_timeout(5000)
        capture(pg, name, '앞말 붙은 질문의 칩')
        ctx.close()
    # 2/3, 3/3: 초안을 기기 저장소에 넣어 연다
    draft = {'state': {'userId': U.uid, 'lines': [{'id': 'l1', 'role': 'coach', 'text': '영어를 하려는 이유를 20자 이상 써 주십시오. 처음 이유는 나중에 바꿀 수 없습니다.'}],
                       'fields': {'reason': '해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다', 'place': '카페', 'my_role': '손님', 'partner': '바리스타',
                                  'task': '원하는 음료를 주문하고 받기', 'goal_name': '카페에서 영어로 주문하기'},
                       'done': True, 'subsituations': ['입장과 인사', '메뉴 묻기', '음료 주문', '옵션 고르기', '결제', '음료 받기'], 'manual': False,
                       'stage': 'plan', 'plan': {'periodDays': 14, 'weekdays': [1, 2, 3, 4, 5], 'startMinutes': 1320, 'targetMinutes': 15}}, 'version': 0}
    ctx, pg = page(b, U, None)
    pg.add_init_script("localStorage.setItem('graego-goal-setup-v1', %s)" % json.dumps(json.dumps(draft)))
    pg.goto(lib.BASE + '/goal/new'); pg.wait_for_timeout(5000)
    capture(pg, 'goal-new-normal-plan')
    ctx.close()
    draft['state']['stage'] = 'confirm'
    ctx, pg = page(b, U, None)
    pg.add_init_script("localStorage.setItem('graego-goal-setup-v1', %s)" % json.dumps(json.dumps(draft)))
    pg.goto(lib.BASE + '/goal/new'); pg.wait_for_timeout(5000)
    capture(pg, 'goal-new-normal-confirm')
    lib.fail_server(pg, '/rest/v1/rpc/create_goal')
    pg.get_by_role('button').filter(has_text='시작').last.click(); pg.wait_for_timeout(2500)
    capture(pg, 'goal-new-error-create', '만들기 500')
    ctx.close()


# ---------- 처음 안내(seenTips를 넣지 않은 컨텍스트) ----------
@sc
def tips(b):
    HOME_STATES['before_first']()
    ctx, pg = page(b, U, '/', ctx_kw={'tips': False})
    capture(pg, 'tips-home-tour', '첫 학습일 전 홈 코치마크 1/3')
    ctx.close()
    s_none()
    ctx, pg = page(b, U, '/goal/new', 5000, ctx_kw={'tips': False})
    capture(pg, 'tips-goal-intro', '목표 정하기 첫 시트')
    ctx.close()
    LEARN.reset(); g = LEARN.goal(start_off=-35, target=10, first=0)
    LEARN.day(g, 0, 'progress', 30, reason='처음이라 긴장되지만 오늘부터 시작해 보려고 합니다', phase='A', started_min=30, target=10)
    ctx, pg = page(b, LEARN, '/session/learn', 6000, ctx_kw={'tips': False})
    capture(pg, 'tips-first-rules', '첫 학습 규칙 모달')
    ctx.close()


# ---------- 온보딩, 인증 ----------
def agree_all(pg):
    """U7: 맨 위 '모두 동의합니다'가 아래 3개를 함께 켠다"""
    pg.get_by_role('checkbox', name='모두 동의합니다').click()
    pg.wait_for_timeout(200)


@sc
def onboarding(b):
    ctx, pg = page(b, None, '/', 4000, onboarded=False)
    capture(pg, 'onboarding-normal-1')
    for i in range(2, 5):
        click(pg, '다음', wait=1200)  # U7: '다음 보기' → '다음'
        capture(pg, f'onboarding-normal-{i}')
    pg.get_by_role('button').last.click(); pg.wait_for_timeout(2500)
    capture(pg, 'onboarding-error', '웹: 알림 권한 요청 결과와 상관없이 넘어감')
    ctx.close()


@sc
def auth(b):
    ctx, pg = page(b, None, '/auth', 4000)
    capture(pg, 'auth-normal-email-blank', '입력 전(비활성 이유)')
    pg.get_by_label('이메일').fill('ui-qa-new@graego.local')
    agree_all(pg)
    capture(pg, 'auth-normal-email', '입력 후')
    if pg.get_by_role('link', name='국외 이전 보기').count():  # U3: 본문 링크(role=link)
        pg.get_by_role('link', name='국외 이전 보기').last.click(); pg.wait_for_timeout(800)
        capture(pg, 'auth-normal-transfer', '국외 이전 펼침')
        pg.get_by_role('link', name='국외 이전 닫기').last.click(); pg.wait_for_timeout(500)
    hold = lib.Hold(pg)
    click(pg, '코드 받기', wait=800)
    capture(pg, 'auth-loading', '요청 대기')
    hold.release(); pg.wait_for_timeout(3000)
    capture(pg, 'auth-normal-code')
    # U7: 6자리면 자동 제출. 틀린 코드면 6칸을 비운다(U8a). '로그인하기'를 또 누르지 않는다
    pg.get_by_label('6자리 코드', exact=False).first.fill('123456') if pg.get_by_label('6자리 코드', exact=False).count() else pg.locator('input').last.fill('123456')
    pg.wait_for_timeout(3000)
    capture(pg, 'auth-error', '틀린 코드(자동 제출)')
    ctx.close()
    ctx, pg = page(b, None, '/auth', 4000)
    pg.get_by_label('이메일').fill('ui-qa-new@graego.local')
    agree_all(pg)
    lib.fail_network(pg)
    click(pg, '코드 받기', wait=2500)
    capture(pg, 'auth-offline')
    ctx.close()
    ctx, pg = page(b, None, '/auth', 4000)
    pg.route('**/auth/v1/otp*', lambda r: r.fulfill(status=429, content_type='application/json', body='{"code":429,"error_code":"over_email_send_rate_limit","msg":"For security purposes, you can only request this after 60 seconds."}'))
    pg.get_by_label('이메일').fill('ui-qa-new@graego.local')
    agree_all(pg)
    click(pg, '코드 받기', wait=2500)
    capture(pg, 'auth-error-rate', '요청 과다 429')
    ctx.close()
    ctx, pg = page(b, None, '/auth', 4000)
    pg.get_by_label('이메일').fill('review@graego.app')
    agree_all(pg)
    click(pg, '코드 받기', wait=2500)
    capture(pg, 'auth-normal-password', '심사 계정')
    pg.locator('input[type=password]').fill('wrong-password')
    click(pg, '로그인하기', wait=2500)
    capture(pg, 'auth-error-password', '비밀번호 틀림')
    ctx.close()


# ---------- 이용 정지, 영구 정지 ----------
def susp_setup(open_window):
    SUSP.reset()
    g = SUSP.goal(start_off=-30, status='given_up')
    start = (lib.now_min() - 5) % 1440 if open_window else (lib.now_min() + 120) % 1440
    lib.sql(f"""update public.profiles set suspended_until = now() + interval '6 days', suspended_goal_id = '{g}', giveup_confirmed_count = 1,
      suspended_start_minutes = {start}, suspended_target_minutes = 15 where user_id = '{SUSP.uid}'""")


@sc
def suspended(b):
    susp_setup(True)
    ctx, pg = page(b, SUSP, None)
    hold = lib.Hold(pg, '/functions/v1/reflection')
    pg.goto(lib.BASE + '/'); pg.wait_for_timeout(4500)
    capture(pg, 'suspended-loading', '반성문 대화 대기')
    hold.release(); pg.wait_for_timeout(3000)
    capture(pg, 'suspended-normal')
    if pg.locator('textarea').count():
        pg.locator('textarea').last.fill('목표를 쉽게 포기한 것을 반성합니다. 다음에는 시간을 줄여서라도 계속하겠습니다.')
        click(pg, '보내기', wait=3500)
        capture(pg, 'suspended-normal-chat')
    ctx.close()
    ctx, pg = page(b, SUSP, None)
    pg.route('**/functions/v1/reflection', lambda r: r.fulfill(status=500, content_type='application/json', body='{"error":"server"}') if r.request.method == 'POST' else r.continue_())
    pg.goto(lib.BASE + '/'); pg.wait_for_timeout(5000)
    capture(pg, 'suspended-error', '반성문 500')
    ctx.close()
    ctx, pg = page(b, SUSP, '/', 5000)
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(5000)
    capture(pg, 'suspended-offline', '캐시 + 끊김')
    ctx.close()
    susp_setup(False)
    ctx, pg = page(b, SUSP, '/', 5000)
    capture(pg, 'suspended-empty', '창 닫힘')
    ctx.close()


@sc
def banned(b):
    BAN.reset()
    lib.sql(f"update public.profiles set banned = true, giveup_confirmed_count = 3 where user_id = '{BAN.uid}'")
    ctx, pg = page(b, BAN, '/', 5000)
    capture(pg, 'banned-normal')
    click(pg, '더 보기', wait=600)  # U3: 헤더 ⋯ → 고르기 시트 → 확인 시트(320ms 뒤)
    click(pg, '계정 삭제하기', wait=1000)
    lib.fail_server(pg, '/functions/v1/delete-account')
    pg.get_by_role('button', name='삭제하기').last.click()
    capture(pg, 'banned-error', '계정 삭제 500', wait=2500)
    ctx.close()
    ctx, pg = page(b, BAN, '/', 5000)
    lib.fail_network(pg)
    pg.reload(); pg.wait_for_timeout(5000)
    capture(pg, 'banned-offline', '캐시 + 끊김')
    ctx.close()


if __name__ == '__main__':
    names = sys.argv[1:] or list(SC)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for n in names:
            t0 = time.time()
            try:
                SC[n](b)
            except Exception as e:
                print(f'!! scenario {n} failed: {type(e).__name__}: {str(e)[:400]}')
            print(f'-- {n} {time.time() - t0:.0f}s')
        b.close()
    print('ERRS', len(ERRS))
    for e in ERRS[:40]:
        print('  ', e)
