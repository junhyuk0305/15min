# P10-6: 스토어 스크린샷. 데모 계정(ui-qa-demo)에 17일 기록을 넣고 7개 화면을 찍는다.
# iPhone 6.7형: 430x932 @3 = 1290x2796.  Play 휴대전화: 360x640 @3 = 1080x1920.
# 2번(잠금 화면 알림)은 웹 빌드로 찍을 수 없어 빠진다(README 참고).
# 사용: python ui-store-shots.py [ios|play] [장면 번호 ...]
import importlib.util, json, os, sys
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('uilib', os.path.join(os.path.dirname(__file__), 'ui-lib.py'))
lib = importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)
STORE = os.path.join(lib.REPO, 'store', 'screenshots')
U = lib.User('ui-qa-demo@graego.local')
GOAL_NAME = '카페에서 영어로 주문하기'
REASON = '지난 출장 때 커피 한 잔도 동료에게 부탁했습니다. 다음 달 시애틀 출장에서는 혼자 주문하고 싶습니다.'
REASONS = [
    '첫날이라 긴장되지만 오늘부터 시작해 보려고 합니다', '어제 배운 인사를 입으로 한 번 더 말해 보려고 합니다',
    '메뉴판 단어가 아직 낯설어서 오늘은 메뉴를 익히려고 합니다', '회의가 길었지만 15분은 지키고 싶어서 앉았습니다',
    '사이즈를 묻는 말에 얼어붙었던 기억이 나서 다시 합니다', '출장이 한 달 남았는데 아직 결제 대화가 막힙니다',
    '어제 쿠폰을 썼으니 오늘은 꼭 채우려고 합니다', '우유를 바꿔 달라는 말을 오늘은 끝까지 해 보려고 합니다',
    '퇴근길에 카페 영어 영상을 보다가 다시 의욕이 났습니다', '동료에게 부탁하지 않고 주문하는 장면을 떠올리며 합니다',
    '어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다', '연속 기록이 아까워서라도 오늘 15분은 채웁니다',
]
TODAY_REASON = '어제 주문은 됐으니 오늘은 사이즈를 바꿔 보려고 합니다'


def history():
    """17일 전부터 어제까지. 토요일은 쉬는 요일. 하루 실패, 하루 쿠폰"""
    U.reset()
    start = (lib.now_min() - 20) % 1440
    g = U.goal(start_abs=start, target=15, weekdays='{0,1,2,3,4,5}', first=-17, period=30, coupons=2, progress_days=4,
               name=GOAL_NAME, reason=REASON)
    dow_today = int(lib.sql("select extract(dow from " + lib.TODAY + ")::int"))
    k = 0
    for off in range(-17, 0):
        if (dow_today + off) % 7 == 6:
            continue
        if off == -11:
            U.day(g, off, 'failed', reason=None)
            continue
        if off == -5:
            U.day(g, off, 'coupon', reason=None)
            continue
        reason = REASONS[k % len(REASONS)]; k += 1
        U.day(g, off, 'done', 900 + (k % 3) * 20, reason=reason, phase='retro', started_min=60 * 24 * -off + 30, retro=180)
        U.msg(g, off, 'B', 'partner', 'Hi there! What can I get for you?', '{}', 1)
        U.msg(g, off, 'B', 'user', ["I'd like a hot americano, please.", 'Can I get a small latte?', 'One iced tea, please.'][k % 3], '{}', 2)
        U.msg(g, off, 'B', 'partner', 'Sure. For here or to go?', '{}', 3)
        U.msg(g, off, 'B', 'user', 'To go, please. Can I pay by card?', '{}', 4)
        U.msg(g, off, 'retro', 'coach', 'Pick one expression you learned today and use it in one sentence about something that happened today.', '{"retro_q":1}', 5)
        U.msg(g, off, 'retro', 'user', 'I ordered a coffee by myself today.', '{"retro_q":1}', 6)
    words = [('receipt', '영수증'), ('size', '크기'), ('decaf', '디카페인'), ('refill', '리필'), ('straw', '빨대'), ('lid', '뚜껑'), ('to go', '포장')]
    exprs = [("I'd like …, please.", '…로 주세요'), ('Could I have … instead?', '대신 …로 주실 수 있습니까?'), ('Can I pay by card?', '카드로 결제할 수 있습니까?')]
    for i, (base, ko) in enumerate(words):
        U.item(g, 'word', base, ko, off=-15 + i * 2)
    for i, (base, ko) in enumerate(exprs):
        U.item(g, 'expression', base, ko, off=-14 + i * 4)
    return g


def gid():
    return lib.sql(f"select id from public.goals where user_id='{U.uid}' and status='active'")


def today_progress(secs, phase, retro=0, retro_started=False):
    lib.sql(f"delete from public.messages where user_id='{U.uid}' and day={lib.TODAY}; delete from public.days where user_id='{U.uid}' and day={lib.TODAY};")
    lib.sql(f"delete from public.item_events where user_id='{U.uid}' and day={lib.TODAY}; delete from public.items where user_id='{U.uid}' and first_day={lib.TODAY};")
    U.day(gid(), 0, 'progress', secs, reason=TODAY_REASON, phase=phase, started_min=35, retro=retro, retro_started=retro_started)


def tidy(pg):
    pg.evaluate("document.querySelectorAll('#error-toast').forEach(e => e.remove())")


def shot(pg, dev, name):
    tidy(pg)
    out = os.path.join(STORE, 'ios-6.7' if dev == 'ios' else 'play')
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, name + '.png')
    pg.screenshot(path=path)
    print('saved', path, '|', pg.inner_text('body')[:200].replace('\n', ' / '))


def ctx_for(b, dev, extra_init=None):
    w, h = (430, 932) if dev == 'ios' else (360, 640)
    ctx = lib.context(b, U, w, h, scale=3)
    if extra_init:
        ctx.add_init_script(extra_init)
    return ctx


def s1_home(b, dev):
    lib.sql(f"delete from public.messages where user_id='{U.uid}' and day={lib.TODAY}; delete from public.days where user_id='{U.uid}' and day={lib.TODAY};")
    ctx = ctx_for(b, dev); pg = ctx.new_page()
    pg.goto(lib.BASE + '/'); pg.wait_for_timeout(6000)
    shot(pg, dev, '01-home-nag'); ctx.close()


def s3_goal_chat(b, dev):
    lines = [
        ('coach', '영어를 하려는 이유를 20자 이상 써 주십시오. 처음 이유는 나중에 바꿀 수 없습니다.'),
        ('user', '지난 출장 때 커피 한 잔도 동료에게 부탁했습니다. 다음 달 시애틀 출장에서는 혼자 주문하고 싶습니다.'),
        ('coach', '분명한 이유입니다. 영어로 말할 장소는 카페, 호텔 프런트, 회의실 중 어디입니까?'),
        ('user', '카페'),
        ('coach', '카페에서는 주문하는 손님이 됩니다. 바리스타, 계산대 점원, 옆자리 손님 중 누구와 말합니까?'),
    ]
    draft = {'state': {'userId': U.uid, 'lines': [{'id': f'l{i}', 'role': r, 'text': t} for i, (r, t) in enumerate(lines)],
                       'fields': {'reason': lines[1][1], 'place': '카페', 'my_role': '손님'}, 'done': False, 'subsituations': [], 'manual': False,
                       'stage': 'chat', 'plan': {'periodDays': 30, 'weekdays': [0, 1, 2, 3, 4, 5], 'startMinutes': 1320, 'targetMinutes': 15}}, 'version': 0}
    # 목표 설정은 활성 목표가 없을 때만 열린다. 이 장면만 잠시 목표를 보관 상태로 돌린다
    lib.sql(f"update public.goals set status='achieved', ended_at=now() where user_id='{U.uid}' and status='active'")
    try:
        ctx = ctx_for(b, dev, "localStorage.setItem('graego-goal-setup-v1', %s)" % json.dumps(json.dumps(draft)))
        pg = ctx.new_page(); pg.goto(lib.BASE + '/goal/new'); pg.wait_for_timeout(6000)
        shot(pg, dev, '03-goal-chat'); ctx.close()
    finally:
        lib.sql(f"update public.goals set status='active', ended_at=null where user_id='{U.uid}' and name=$n${GOAL_NAME}$n$")


def s4_learn_b(b, dev):
    today_progress(330, 'B')
    g = gid()
    U.msg(g, 0, 'B', 'partner', 'Hi! Welcome in. What can I get started for you?', '{}', 1)
    U.msg(g, 0, 'B', 'user', 'Can I get an iced latte?', '{}', 2)
    U.msg(g, 0, 'B', 'partner', 'Sure thing. What size would you like?', '{}', 3)
    ctx = ctx_for(b, dev); pg = ctx.new_page()
    pg.goto(lib.BASE + '/session/learn'); pg.wait_for_timeout(9000)
    tidy(pg)
    pg.locator('textarea').last.fill('I want order a large size.')
    pg.get_by_role('button', name='보내기', exact=True).last.click(); pg.wait_for_timeout(4000)
    shot(pg, dev, '04-learn-b-coach'); ctx.close()


def s5_learn_a(b, dev):
    today_progress(40, 'A')
    lib.sql(f"update public.items set next_due_day = {lib.TODAY} where user_id='{U.uid}' and base in ('Could I have … instead?')")
    ctx = ctx_for(b, dev); pg = ctx.new_page()
    pg.goto(lib.BASE + '/session/learn'); pg.wait_for_timeout(9000)
    tidy(pg)
    body = pg.inner_text('body')
    items = dict((ko, base) for base, ko in [(r.split('|')[0], r.split('|')[1]) for r in lib.sql(f"select base||'|'||ko from public.items where user_id='{U.uid}'").splitlines()])
    if pg.get_by_role('radio').count():
        pg.get_by_role('radio').first.click()
    else:
        ans = 'Could I have oat milk instead?'
        for ko, base in items.items():
            if f'뜻: {ko}' in body:
                ans = base.replace('…', 'oat milk')
        pg.locator('textarea').last.fill(ans)
    pg.get_by_role('button', name='제출하기').click(); pg.wait_for_timeout(700)
    shot(pg, dev, '05-learn-a-review'); ctx.close()


def s6_retro(b, dev):
    today_progress(900, 'retro', retro=105, retro_started=True)
    g = gid()
    U.msg(g, 0, 'retro', 'coach', 'Pick one expression you learned today and use it in one sentence about something that happened today.', '{"retro_q":1}', 1)
    U.msg(g, 0, 'retro', 'user', "I'd like a large iced latte, please. I said it at the cafe near my office this morning.", '{"retro_q":1}', 2)
    U.msg(g, 0, 'retro', 'coach', 'How was your day today?', '{"retro_q":2}', 3)
    U.msg(g, 0, 'retro', 'user', 'It was busy, but I felt less nervous when I ordered.', '{"retro_q":2}', 4)
    U.msg(g, 0, 'retro', 'coach', 'What made you feel less nervous this time?', '{"retro_q":3}', 5)
    ctx = ctx_for(b, dev); pg = ctx.new_page()
    pg.goto(lib.BASE + '/session/retro'); pg.wait_for_timeout(7000)
    tidy(pg)
    pg.locator('textarea').last.fill('I practiced the size question yesterday, so')
    pg.wait_for_timeout(500)
    shot(pg, dev, '06-retro'); ctx.close()


def s7_done(b, dev):
    today_progress(900, 'retro', retro=180, retro_started=True)
    lib.sql(f"update public.days set status='done', completed_at=now() where user_id='{U.uid}' and day={lib.TODAY}")
    g = gid()
    for base, ko in [('large', '큰'), ('oat milk', '귀리 우유'), ('whipped cream', '휘핑크림')]:
        U.item(g, 'word', base, ko, off=0)
    for base, ko in [('What size would you like?', '어떤 크기로 드릴까요?'), ('Could I get it in a large?', '큰 걸로 주실 수 있습니까?')]:
        U.item(g, 'expression', base, ko, off=0)
    for base in ('receipt', 'size', "I'd like …, please."):
        iid = lib.sql(f"select id from public.items where user_id='{U.uid}' and base=$b${base}$b$")
        lib.sql(f"insert into public.item_events (id, user_id, item_id, day, phase, kind, correct, aided) values (gen_random_uuid(), '{U.uid}', '{iid}', {lib.TODAY}, 'A', 'quiz', true, false)")
    ctx = ctx_for(b, dev); pg = ctx.new_page()
    pg.goto(lib.BASE + '/session/done?earned=1'); pg.wait_for_timeout(7000)
    shot(pg, dev, '07-done'); ctx.close()


def s8_archive(b, dev):
    ctx = ctx_for(b, dev); pg = ctx.new_page()
    pg.goto(lib.BASE + '/archive'); pg.wait_for_timeout(7000)
    shot(pg, dev, '08-archive-calendar'); ctx.close()


SCENES = {'1': s1_home, '3': s3_goal_chat, '4': s4_learn_b, '5': s5_learn_a, '6': s6_retro, '7': s7_done, '8': s8_archive}

if __name__ == '__main__':
    devs = [a for a in sys.argv[1:] if a in ('ios', 'play')] or ['ios', 'play']
    nums = [a for a in sys.argv[1:] if a in SCENES] or list(SCENES)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for dev in devs:
            history()
            for n in ['8', '1', '3', '5', '4', '6', '7']:
                if n in nums:
                    SCENES[n](b, dev)
        b.close()
