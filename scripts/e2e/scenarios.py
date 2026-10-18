"""MP 7.2 사용자 여정 S1~S17 화면 검증(Playwright, 웹 빌드).

사용법: python scripts/e2e/scenarios.py [S1 S3 ...]   (인자가 없으면 전부)
전제: 로컬 Supabase(AI_FAKE=1로 Edge Functions 서빙), Expo 웹 서버(E2E_APP_URL, 기본 http://localhost:8101).
시간 이동: 목표의 first_day, start_minutes, days.session_started_at, giveup_requested_at, suspended_until을
SQL로 과거로 옮겨 그 순간을 만든다. 결과는 docs/시나리오/*.png 와 scripts/e2e/results.json.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import (  # noqa: E402
    APP, ROOT, clear_deleted, has, latest_otp, make_goal, make_user, new_context, now_minutes, open_app,
    session_for, settle, shot, sql, sql1, text, today, wait_text,
)
from playwright.sync_api import sync_playwright  # noqa: E402

RESULTS = Path(__file__).resolve().parent / 'results.json'
EMAIL = os.environ.get('E2E_EMAIL_PREFIX', '') + '{}@scenario.test'  # 여러 에이전트가 같은 DB를 쓸 때 접두사로 나눈다
AGREE = '알림 켜기'  # 온보딩 마지막 버튼
CONSENTS = ['[필수] 만 18세 이상입니다', '[필수] 이용약관과 개인정보처리방침에 동의합니다',
            '[필수] Google Gemini API로 학습 내용을 처리하고 국외로 이전하는 데 동의합니다']


class Check:
    def __init__(self, sid: str):
        self.sid = sid
        self.items: list[dict] = []
        self.shots: list[str] = []

    def ok(self, name: str, cond: bool, actual: str = ''):
        self.items.append({'name': name, 'pass': bool(cond), 'actual': actual})
        print(f"  [{'PASS' if cond else 'FAIL'}] {self.sid} {name} {('— ' + actual) if actual else ''}")
        return cond

    def shot(self, page, name: str):
        self.shots.append(shot(page, f'{self.sid}-{name}'))


def uid_of(email: str) -> str:
    return sql1(f"select id from auth.users where lower(email) = lower('{email}');")


def click(page, name: str, timeout: int = 15000):
    page.get_by_role('button', name=name, exact=True).first.click(timeout=timeout)


def fill_send(page, placeholder: str, value: str, send: str):
    box = page.get_by_placeholder(placeholder).first
    box.fill(value)
    page.get_by_role('button', name=send, exact=True).last.click()


# ───────── S1: 설치, 가입, 목표 설정 ─────────
def s1(b, c: Check):
    email = EMAIL.format('s1-ui')
    sql(f"delete from auth.users where lower(email) = lower('{email}');")
    clear_deleted(email)
    ctx = new_context(b, None, onboarded=False)
    page = ctx.new_page()
    page.goto(APP + '/')
    settle(page)
    c.ok('첫 실행은 온보딩', '/onboarding' in page.url, page.url)
    c.shot(page, '온보딩')
    for _ in range(5):
        if page.get_by_role('button', name=AGREE, exact=True).count():
            break
        click(page, '다음 보기')
        page.wait_for_timeout(400)
    c.ok('온보딩 마지막 장: 동의 문장이 버튼 위에', has(page, '알림 켜기를 누르면 위 규칙에 동의한 것으로 봅니다.'), '')
    click(page, AGREE)
    settle(page)
    c.ok('온보딩 뒤 로그인 화면', '/auth' in page.url, page.url)
    page.get_by_placeholder('name@example.com').fill(email)
    for label in CONSENTS:
        page.get_by_text(label, exact=True).first.click()
    c.shot(page, '가입')
    sent = time.time()
    click(page, '코드 받기')
    code = latest_otp(email, after=sent)
    page.wait_for_timeout(800)
    page.get_by_label('6자리 코드').first.fill(code)
    click(page, '로그인하기')
    settle(page, 2500)
    if '/goal/new' not in page.url:
        if page.get_by_role('button', name='목표 정하기').count():
            click(page, '목표 정하기')
            settle(page)
    c.ok('로그인 뒤 목표 정하기', '/goal/new' in page.url, page.url)
    answers = ['해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다. 혼자 하고 싶습니다.',
               '카페', '손님', '바리스타', '원하는 음료를 주문하고 받기', '좋습니다']
    for a in answers:
        if not page.get_by_placeholder('한국어로 답하셔도 됩니다.').count():
            break  # 항목이 다 차면 2/3 학습 약속으로 넘어간다
        fill_send(page, '한국어로 답하셔도 됩니다.', a, '보내기')
        page.wait_for_timeout(1800)
        # 1/3 채팅이 보이는 마지막 모습을 남긴다(넘어간 뒤에 찍으면 학습약속과 같은 사진이 된다)
        if page.get_by_placeholder('한국어로 답하셔도 됩니다.').count():
            c.ok('목표 채팅 화면', has(page, '1 / 3'), '') if a == answers[0] else None
            c.shot(page, '목표채팅')
    if page.get_by_role('button', name='이어서 정하기').count():
        click(page, '이어서 정하기')
        settle(page, 800)
    c.shot(page, '학습약속')
    click(page, '확인하기')
    settle(page, 800)
    c.ok('확인 화면에 내일 시작 안내', has(page, '내일'), text(page)[:300].replace('\n', ' / '))
    click(page, '이걸로 시작')
    settle(page, 2500)
    body = text(page)
    c.ok('홈에 목표 카드(목표 이름)', '카페에서 영어로 말하기' in body, body[:200].replace('\n', ' / '))
    c.ok('홈에 내일 시작 시각', '첫 학습까지' in body and '내일' in body, '')
    c.shot(page, '홈')
    uid = uid_of(email)
    n = sql1(f"select count(*) from public.goals where user_id = '{uid}';")
    tz = sql1(f"select timezone from public.profiles where user_id = '{uid}';")
    first = sql1(f"select first_day - app_private.day_key(now(), 'Asia/Seoul') from public.goals where user_id = '{uid}';")
    c.ok('DB goals 1행', n == '1', f'goals={n}')
    c.ok('DB profiles.timezone 저장', tz == 'Asia/Seoul', f'timezone={tz}')
    c.ok('DB first_day = 내일', first == '1', f'first_day-오늘={first}')
    ctx.close()


def user_with_goal(sid: str, start_delta: int, **kw):
    email = EMAIL.format(sid.lower())
    clear_deleted(email)
    uid = make_user(email)
    gid = make_goal(uid, now_minutes(start_delta), **kw)
    return email, uid, gid


# ───────── S2: 다음 날 사전 알림 전 ─────────
def s2(b, c: Check):
    email, uid, gid = user_with_goal('S2', 60)
    ctx, page = open_app(b, session_for(email))
    body = text(page)
    c.ok('대기 상태 "시작까지"', '시작까지' in body, body[:200].replace('\n', ' / '))
    t1 = page.get_by_text(':', exact=False).filter(has_text='시작까지').count()
    first = body.split('시작까지')[1].split('\n')[1] if '시작까지' in body else ''
    page.wait_for_timeout(2200)
    second = text(page).split('시작까지')[1].split('\n')[1] if '시작까지' in text(page) else ''
    c.ok('카운트다운이 줄어듦', first != second and ':' in first, f'{first} → {second}')
    c.shot(page, '대기')
    n = sql1(f"select count(*) from public.days where user_id = '{uid}';")
    c.ok('DB days 없음', n == '0', f'days={n}')
    ctx.close()


def session_page(b, email: str):
    ctx, page = open_app(b, session_for(email))
    return ctx, page


def start_today(page, reason: str):
    """홈에서 지금 시작 → 오늘의 이유 → 시작하기"""
    click(page, '지금 시작')
    settle(page)
    page.get_by_placeholder('오늘 이걸 하는 이유를 쓰십시오.').fill(reason)
    click(page, '시작하기')
    settle(page, 2500)


def remaining(page) -> str:
    """학습 화면 상단 큰 시계(전체 남은 시간). '이 단계 mm:ss'(멈췄으면 '멈춤') 다음 줄"""
    m = re.search(r'(?:이 단계 \d+:\d+|멈춤)\s*\n\s*(\d+:\d+)', text(page))
    return m.group(1) if m else ''


# ───────── S3: 정각에 시작, 끝까지 완료 ─────────
def s3(b, c: Check):
    email, uid, gid = user_with_goal('S3', -1)
    ctx, page = session_page(b, email)
    c.ok('정각 홈: 지금 시작 버튼', page.get_by_role('button', name='지금 시작').count() > 0, text(page)[:160].replace('\n', ' / '))
    c.shot(page, '1홈정각')
    click(page, '지금 시작')
    settle(page)
    c.ok('오늘의 이유 화면', has(page, '오늘은 왜 하십니까?'), page.url)
    c.shot(page, '2이유')
    page.get_by_placeholder('오늘 이걸 하는 이유를 쓰십시오.').fill('출장 전에 카페 주문 한 문장이라도 더 말해 보려고 합니다.')
    click(page, '시작하기')
    settle(page, 3000)
    c.ok('A 단계(첫날 수준 확인)', '/session/learn' in page.url and (has(page, '수준 확인') or has(page, '지난 학습 복습')), text(page)[:200].replace('\n', ' / '))
    c.shot(page, '3A')
    # 시간 이동: A 끝(20%)을 지나게 시작 시각과 진행을 옮긴다 → B
    sql(f"update public.days set session_started_at = now() - interval '3 minutes', active_seconds = 150 where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul');")
    page.reload()
    settle(page, 3500)
    c.ok('B 단계(상황 대화)', has(page, '상황 대화'), text(page)[:200].replace('\n', ' / '))
    try:
        fill_send(page, '영어로 답하십시오.', "Hi, I'd like an iced latte, please.", '보내기')
        page.wait_for_timeout(2500)
    except Exception as e:  # noqa: BLE001
        c.ok('B 단계 답 보내기', False, str(e)[:120])
    c.shot(page, '4B')
    # C(마지막 20%)로
    sql(f"update public.days set session_started_at = now() - interval '9 minutes', active_seconds = 500, phase = 'B' where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul');")
    page.reload()
    settle(page, 3500)
    c.ok('C 단계(오늘 학습 복습)', has(page, '오늘 학습 복습'), text(page)[:200].replace('\n', ' / '))
    c.shot(page, '5C')
    # 학습 분 채움 → 회고하기
    sql(f"update public.days set session_started_at = now() - interval '11 minutes', active_seconds = 597, phase = 'C' where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul');")
    page.reload()
    settle(page, 3000)
    ok_retro = wait_text(page, '회고하기', 15000)
    if ok_retro:
        click(page, '회고하기')
        settle(page, 3000)
    c.ok('회고 화면', '/session/retro' in page.url or has(page, '3분 동안 영어로'), page.url)
    try:
        fill_send(page, '영어로 답하십시오.', 'I ordered an iced latte and asked about the size.', '보내기')
        page.wait_for_timeout(2500)
    except Exception:
        pass
    c.shot(page, '6회고')
    sql(f"update public.days set retro_started_at = now() - interval '200 seconds', retro_seconds = 178 where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul');")
    page.reload()
    settle(page, 3000)
    if wait_text(page, '완료하기', 15000):
        page.wait_for_timeout(2500)
        click(page, '완료하기')
        settle(page, 3000)
    c.ok('완료 화면', '/session/done' in page.url or has(page, '채웠습니다'), text(page)[:200].replace('\n', ' / '))
    c.shot(page, '7완료')
    if page.get_by_role('button', name='홈으로 가기').count():
        click(page, '홈으로 가기')
        settle(page, 2000)
    body = text(page)
    c.ok('홈 완료 상태(분 완료)', '분 완료' in body, body[:200].replace('\n', ' / '))
    c.ok('홈 연속 1일', '연속 1일' in body, '')
    c.shot(page, '8홈완료')
    st = sql1(f"select status from public.days where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul');")
    pr = sql1(f"select coupon_progress_days from public.goals where id = '{gid}';")
    c.ok('DB days.status done', st == 'done', st)
    c.ok('DB 연속 1(쿠폰 진행 1)', pr == '1', pr)
    ctx.close()


def learning_user(sid: str, active: int, minutes_ago: int, phase: str = 'B'):
    """B 단계 학습 중인 사용자. 20분 목표, 시작 minutes_ago분 전"""
    email, uid, gid = user_with_goal(sid, -minutes_ago - 1, target=20)
    sql(f"""
      insert into public.days (goal_id, day, user_id, status, today_reason, phase, target_minutes, session_started_at, active_seconds)
      values ('{gid}', app_private.day_key(now(), 'Asia/Seoul'), '{uid}', 'progress',
              '오늘도 카페 주문을 한 문장 더 말해 보려고 합니다', '{phase}', 20, now() - interval '{minutes_ago} minutes', {active});
    """)
    return email, uid, gid


def visibility(page, hidden: bool):
    page.evaluate("""(h) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }""", hidden)


def chat_lines(page) -> int:
    return page.locator('text=/Hi there|Got it|Sure thing|Okay\\. What|Thanks\\. How|iced latte/').count()


# ───────── S4: 학습 중 앱 이탈 후 복귀 ─────────
def s4(b, c: Check):
    email, uid, gid = learning_user('S4', 300, 6)
    ctx, page = session_page(b, email)
    if '/session/learn' not in page.url and page.get_by_role('button', name='이어서 하기').count():
        click(page, '이어서 하기')
        settle(page, 3000)
    c.ok('학습 화면(B)', '/session/learn' in page.url and has(page, '상황 대화'), page.url)
    fill_send(page, '영어로 답하십시오.', "Hi, I'd like an iced latte, please.", '보내기')
    page.wait_for_timeout(3000)
    before_text = text(page)
    before = remaining(page)
    c.shot(page, '이탈전')
    visibility(page, True)
    page.wait_for_timeout(5000)
    act_hidden = sql1(f"select active_seconds from public.days where goal_id = '{gid}';")
    visibility(page, False)
    page.wait_for_timeout(1000)
    after = remaining(page)
    c.ok('같은 채팅(보낸 문장이 남음)', "I'd like an iced latte" in text(page), '')
    c.ok('같은 남은 시간(이탈 5초는 세지 않음)', bool(before) and abs(_sec(before) - _sec(after)) <= 3, f'{before} → {after}')
    c.shot(page, '복귀')
    act = sql1(f"select active_seconds from public.days where goal_id = '{gid}';")
    c.ok('DB active_seconds 유지(줄지 않음)', int(act) >= 300, f'이탈 중 {act_hidden}, 복귀 뒤 {act}')
    ctx.close()


def _sec(clock: str) -> int:
    try:
        m, s = clock.strip().split(':')[-2:]
        return int(m) * 60 + int(s)
    except Exception:
        return -9999


# ───────── S5: 학습 중 강제 종료 후 재실행 ─────────
def s5(b, c: Check):
    email, uid, gid = learning_user('S5', 300, 6)
    ctx, page = session_page(b, email)
    if '/session/learn' not in page.url and page.get_by_role('button', name='이어서 하기').count():
        click(page, '이어서 하기')
        settle(page, 3000)
    fill_send(page, '영어로 답하십시오.', "Hi, I'd like an iced latte, please.", '보내기')
    page.wait_for_timeout(3000)
    fill_send(page, '영어로 답하십시오.', 'A large one with oat milk, please.', '보내기')
    page.wait_for_timeout(3000)
    n_before = sql1(f"select count(*) from public.messages where goal_id = '{gid}';")
    before = remaining(page)
    c.shot(page, '종료전')
    # 강제 종료: 탭을 닫고 새 탭으로 다시 연다(같은 저장소)
    page.close()
    page = ctx.new_page()
    page.goto(APP + '/')
    settle(page, 3500)
    if '/session/learn' not in page.url and page.get_by_role('button', name='이어서 하기').count():
        click(page, '이어서 하기')
        settle(page, 3000)
    after = remaining(page)
    body = text(page)
    c.ok('재실행 뒤 학습 화면', '/session/learn' in page.url, page.url)
    c.ok('같은 채팅(두 문장 모두 보임)', "I'd like an iced latte" in body and 'oat milk' in body, '')
    c.ok('같은 남은 시간(±5초)', bool(before) and abs(_sec(before) - _sec(after)) <= 5, f'{before} → {after}')
    c.shot(page, '재실행')
    n_after = sql1(f"select count(*) from public.messages where goal_id = '{gid}';")
    users = sql1(f"select count(*) from public.messages where goal_id = '{gid}' and role = 'user';")
    c.ok('DB 메시지 유실 0(재실행 전후 같은 수, 내 문장 2개)', n_before == n_after and users == '2', f'{n_before} → {n_after}, user={users}')
    ctx.close()


# ───────── S6: 2분 무입력 ─────────
def s6(b, c: Check):
    email, uid, gid = learning_user('S6', 300, 6)
    ctx, page = session_page(b, email)
    if '/session/learn' not in page.url and page.get_by_role('button', name='이어서 하기').count():
        click(page, '이어서 하기')
        settle(page, 3000)
    fill_send(page, '영어로 답하십시오.', "Hi, I'd like an iced latte, please.", '보내기')
    page.wait_for_timeout(2500)
    ok = wait_text(page, '딴짓 중이십니까?', 150000)
    c.ok('2분 무입력 → 딴짓 팝업', ok, '')
    act1 = sql1(f"select active_seconds from public.days where goal_id = '{gid}';")
    r1 = remaining(page)
    c.shot(page, '딴짓')
    page.wait_for_timeout(15000)
    r2 = remaining(page)
    act2 = sql1(f"select active_seconds from public.days where goal_id = '{gid}';")
    c.ok('팝업 중 시간 멈춤(15초 동안 남은 시간 그대로)', r1 == r2 and bool(r1), f'{r1} → {r2}')
    c.ok('DB active_seconds 증가 없음', act1 == act2, f'{act1} → {act2}')
    ctx.close()


# ───────── S7: 시작 안 하고 독촉 구간 ─────────
def s7(b, c: Check):
    email, uid, gid = user_with_goal('S7', -20)  # 10분 목표 → 10분 전부터 독촉
    ctx, page = session_page(b, email)
    body = text(page)
    c.ok('홈 독촉 상태(약속 시각이 지났습니다)', '약속 시각이 지났습니다' in body and '분 늦음' in body, body[:200].replace('\n', ' / '))
    c.ok('지금 시작 버튼', page.get_by_role('button', name='지금 시작').count() > 0, '')
    page.wait_for_timeout(1200)
    c.shot(page, '독촉')
    bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    root_bg = page.evaluate("""() => { const els=[...document.querySelectorAll('div')]; const r = els.map(e=>getComputedStyle(e).backgroundColor).filter(x=>/rgb\\((1[5-9]\\d|2\\d\\d), ?(\\d{1,2}), ?(\\d{1,2})\\)/.test(x)); return r.slice(0,3); }""")
    c.ok('붉은 배경', bool(root_bg), f'body={bg}, red={root_bg}')
    n = sql1(f"select count(*) from public.days where goal_id = '{gid}';")
    c.ok('DB 아직 하루 행 없음', n == '0', n)
    ctx.close()


# ───────── S8: 독촉 중 쿠폰 사용 ─────────
def s8(b, c: Check):
    email, uid, gid = user_with_goal('S8', -20, first_offset=-1)
    sql(f"""insert into public.days (goal_id, day, user_id, status, target_minutes, completed_at)
           values ('{gid}', app_private.day_key(now(), 'Asia/Seoul') - 1, '{uid}', 'done', 10, now() - interval '1 day');
           update public.goals set coupon_progress_days = 1 where id = '{gid}';""")
    ctx, page = session_page(b, email)
    c.ok('홈 글자 버튼 "쿠폰 쓰기"와 "남은 쿠폰 3장"', page.get_by_role('button', name='쿠폰 쓰기', exact=True).count() > 0 and has(page, '남은 쿠폰 3장'), '')
    click(page, '쿠폰 쓰기')
    settle(page)
    c.ok('쿠폰 시트 열림', '/coupon' in page.url, page.url)
    c.shot(page, '1시트')
    page.get_by_role('button', name='쿠폰 쓰기', exact=True).last.click()
    settle(page, 2000)
    body = text(page)
    c.ok('쿠폰 문구(오늘은 쉬십시오)', '오늘은 쉬십시오' in body, body[:200].replace('\n', ' / '))
    c.shot(page, '2사용')
    if page.get_by_role('button', name='홈으로 가기').count():
        click(page, '홈으로 가기')
        settle(page, 1500)
    body = text(page)
    c.ok('홈 쉬는 날 상태(오늘은 쉽니다)', '오늘은 쉽니다' in body and '쿠폰 2장 남음' in body, body[:200].replace('\n', ' / '))
    c.ok('홈 연속 0일', '연속 0일' in body, '')
    c.shot(page, '3홈')
    st = sql1(f"select status from public.days where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul');")
    g = sql1(f"select coupons || ',' || coupon_progress_days from public.goals where id = '{gid}';")
    c.ok('DB coupon', st == 'coupon', st)
    c.ok('DB 쿠폰 1장 감소, 연속 0', g == '2,0', f'coupons,progress={g}')
    ctx.close()


# ───────── S9: 미완료로 04:00 지남 ─────────
def s9(b, c: Check):
    email, uid, gid = user_with_goal('S9', 60, first_offset=-2)
    sql(f"""insert into public.days (goal_id, day, user_id, status, target_minutes, completed_at)
           values ('{gid}', app_private.day_key(now(), 'Asia/Seoul') - 2, '{uid}', 'done', 10, now() - interval '2 days');
           update public.goals set coupon_progress_days = 1 where id = '{gid}';""")
    ctx, page = session_page(b, email)
    body = text(page)
    c.ok('홈 실패 안내', '지난 학습일을 채우지 못했습니다' in body, body[:260].replace('\n', ' / '))
    c.ok('홈 연속 0일', '연속 0일' in body, '')
    c.shot(page, '실패')
    st = sql1(f"select status from public.days where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul') - 1;")
    pr = sql1(f"select coupon_progress_days from public.goals where id = '{gid}';")
    c.ok('DB 어제 failed', st == 'failed', st)
    c.ok('DB 연속 0(쿠폰 진행 0)', pr == '0', pr)
    ctx.close()


# ───────── S10: 쉬는 요일 ─────────
def s10(b, c: Check):
    dow = int(sql1("select extract(dow from app_private.day_key(now(), 'Asia/Seoul'))::int;"))
    rest = {dow, (dow - 1) % 7}
    wd = '{' + ','.join(str(d) for d in range(7) if d not in rest) + '}'
    email, uid, gid = user_with_goal('S10', 60, weekdays=wd, first_offset=-2)
    sql(f"""insert into public.days (goal_id, day, user_id, status, target_minutes, completed_at)
           values ('{gid}', app_private.day_key(now(), 'Asia/Seoul') - 2, '{uid}', 'done', 10, now() - interval '2 days');
           update public.goals set coupon_progress_days = 1 where id = '{gid}';""")
    ctx, page = session_page(b, email)
    body = text(page)
    c.ok('홈 쉬는 요일 상태', '오늘은 쉬는 요일입니다' in body, body[:200].replace('\n', ' / '))
    c.ok('연속 유지(연속 1일)', '연속 1일' in body, '')
    c.ok('지금 시작 버튼 없음', page.get_by_role('button', name='지금 시작').count() == 0, '')
    c.shot(page, '쉬는요일')
    st = sql1(f"select status from public.days where goal_id = '{gid}' and day = app_private.day_key(now(), 'Asia/Seoul') - 1;")
    pr = sql1(f"select coupon_progress_days from public.goals where id = '{gid}';")
    c.ok('DB 어제(쉬는 요일) rest', st == 'rest', st)
    c.ok('DB 연속 유지(쿠폰 진행 1)', pr == '1', pr)
    ctx.close()


# ───────── S11: 포기 신청 후 철회 ─────────
def s11(b, c: Check):
    email, uid, gid = user_with_goal('S11', 60)
    ctx, page = session_page(b, email)
    page.goto(APP + '/settings/giveup')
    settle(page)
    c.shot(page, '1신청')
    click(page, '포기 신청하기')
    settle(page, 800)
    c.ok('마지막 확인 화면', has(page, '마지막으로 묻습니다.'), '')
    click(page, '포기 신청하기')
    settle(page, 2500)
    if '/settings' in page.url and page.get_by_role('button', name='홈으로 가기').count():
        click(page, '홈으로 가기')
        settle(page)
    if page.url.rstrip('/') != APP.rstrip('/'):
        page.goto(APP + '/')
        settle(page)
    body = text(page)
    c.ok('홈 대기 상태(포기 확정까지)', '포기 확정까지' in body, body[:200].replace('\n', ' / '))
    c.shot(page, '2대기')
    req = sql1(f"select giveup_requested_at is not null from public.goals where id = '{gid}';")
    c.ok('DB 포기 신청 기록', req == 't', req)
    click(page, '포기 철회하기')
    settle(page, 2500)
    body = text(page)
    c.ok('원래 홈(시작까지)', '시작까지' in body and '포기 확정까지' not in body, body[:200].replace('\n', ' / '))
    c.shot(page, '3철회')
    r = sql1(f"select (g.giveup_requested_at is null)::text || ',' || p.giveup_confirmed_count from public.goals g join public.profiles p on p.user_id = g.user_id where g.id = '{gid}';")
    c.ok('DB 철회, 확정 횟수 그대로(0)', r == 'true,0', r)
    ctx.close()


def pending_giveup(sid: str, confirmed_before: int):
    email, uid, gid = user_with_goal(sid, 60)
    sql(f"""update public.profiles set giveup_confirmed_count = {confirmed_before} where user_id = '{uid}';
           update public.goals set giveup_requested_at = now() - interval '25 hours' where id = '{gid}';""")
    return email, uid, gid


# ───────── S12: 포기 확정(1회) ─────────
def s12(b, c: Check):
    email, uid, gid = pending_giveup('S12', 0)
    ctx, page = session_page(b, email)
    page.wait_for_timeout(1500)
    body = text(page)
    c.ok('반성문 화면만(/suspended)', '/suspended' in page.url and '이용 정지 중입니다' in body, page.url)
    c.ok('탭 막대 없음(홈, 기록, 설정 글자 없음)', not any(w in body.splitlines() for w in ['홈', '기록', '설정']), '')
    page.goto(APP + '/')
    settle(page)
    c.ok('홈으로 가도 반성문 화면으로', '/suspended' in page.url, page.url)
    page.goto(APP + '/goal/new')
    settle(page)
    c.ok('새 목표 경로도 반성문 화면으로', '/suspended' in page.url, page.url)
    c.shot(page, '반성문')
    d = sql1(f"select round(extract(epoch from suspended_until - now()) / 86400.0, 2) || ',' || giveup_confirmed_count from public.profiles where user_id = '{uid}';")
    days_left, cnt = d.split(',')
    c.ok('DB suspended_until ≈ +7일', 6.9 < float(days_left) <= 7.0, f'남은 일수={days_left}')
    c.ok('DB 확정 횟수 1', cnt == '1', cnt)
    # 반성문 창: 원래 시작 시각을 지금 직전으로 옮겨 채팅이 열리는지 본다
    sql(f"update public.profiles set suspended_start_minutes = {now_minutes(-1)} where user_id = '{uid}';")
    page.reload()
    settle(page, 3000)
    opened = page.get_by_placeholder('왜 포기했는지 쓰십시오.').count() > 0
    c.ok('원래 시각에 반성문 채팅이 열림', opened, text(page)[:200].replace('\n', ' / '))
    if opened:
        fill_send(page, '왜 포기했는지 쓰십시오.', '퇴근이 늦어져서 시간을 못 냈습니다.', '보내기')
        page.wait_for_timeout(3000)
        c.ok('반성문 코치 답', has(page, '완료한 날은'), '')
        c.shot(page, '반성문채팅')
    n = sql1(f"select count(*) from public.reflections where user_id = '{uid}';")
    c.ok('DB reflections 기록', int(n) >= 2, f'reflections={n}')
    ctx.close()


# ───────── S13: 정지 해제 ─────────
def s13(b, c: Check):
    email, uid, gid = pending_giveup('S13', 0)
    sql(f"select app_private.settle_user('{uid}', now());")
    sql(f"update public.profiles set suspended_until = now() - interval '1 minute' where user_id = '{uid}';")
    ctx, page = session_page(b, email)
    page.wait_for_timeout(1500)
    body = text(page)
    c.ok('새 목표 만들기로 감', '/goal/new' in page.url or '목표 정하기' in body, page.url + ' / ' + body[:120].replace('\n', ' / '))
    if '/goal/new' not in page.url and page.get_by_role('button', name='목표 정하기').count():
        c.shot(page, '1홈')
        click(page, '목표 정하기')
        settle(page)
    c.ok('목표 정하기 화면', '/goal/new' in page.url, page.url)
    c.shot(page, '새목표')
    r = sql1(f"select coalesce(suspended_until::text, 'null') from public.profiles where user_id = '{uid}';")
    c.ok('DB suspended_until 해제(null)', r == 'null', r)
    ctx.close()


# ───────── S14: 포기 3회째 확정 ─────────
def s14(b, c: Check):
    email, uid, gid = pending_giveup('S14', 2)
    ctx, page = session_page(b, email)
    page.wait_for_timeout(1500)
    body = text(page)
    c.ok('영구 정지 안내만(/banned)', '/banned' in page.url and '영구 이용 정지된 계정입니다' in body, page.url)
    c.ok('포기 3번 문구', '포기를 3번 확정해' in body, '')
    page.goto(APP + '/')
    settle(page)
    c.ok('홈으로 가도 정지 안내로', '/banned' in page.url, page.url)
    c.shot(page, '영구정지')
    r = sql1(f"select banned::text || ',' || giveup_confirmed_count from public.profiles where user_id = '{uid}';")
    c.ok('DB banned, 횟수 3', r == 'true,3', r)
    ctx.close()


# ───────── S15: 기간 경과 후 달성 선언 ─────────
def s15(b, c: Check):
    email, uid, gid = user_with_goal('S15', 60, period=7, first_offset=-7)
    sql(f"""insert into public.days (goal_id, day, user_id, status, target_minutes, completed_at, active_seconds)
           select '{gid}', d, '{uid}', 'done', 10, now() - interval '1 day', 600
           from generate_series(app_private.day_key(now(), 'Asia/Seoul') - 7, app_private.day_key(now(), 'Asia/Seoul') - 1, interval '1 day') d;
           update public.goals set coupon_progress_days = 7 where id = '{gid}';""")
    ctx, page = session_page(b, email)
    c.ok('홈 달성 선언하기 버튼', page.get_by_text('달성 선언하기').count() > 0, text(page)[:200].replace('\n', ' / '))
    c.shot(page, '1홈')
    page.get_by_text('달성 선언하기').first.click()
    settle(page)
    c.shot(page, '2확인')
    click(page, '달성 선언하기')
    settle(page, 2500)
    body = text(page)
    c.ok('축하 화면(7일을 해내셨습니다)', '7일을 해내셨습니다' in body, body[:200].replace('\n', ' / '))
    c.shot(page, '3축하')
    url_before = page.url
    page.keyboard.press('Escape')
    page.go_back()
    settle(page)
    back_url = page.url
    st = sql1(f"select status from public.goals where id = '{gid}';")
    c.ok('DB achieved', st == 'achieved', st)
    # 웹 브라우저 뒤로 가기는 앱이 막지 못한다(결정로그 "달성 화면 숫자"). 뒤로 가도 달성 선언 화면으로 못 돌아가는지 본다.
    c.ok('뒤로 가기 해도 선언 전 상태로 못 돌아감', '달성을 선언하시겠습니까?' not in text(page) or page.get_by_role('button', name='달성 선언하기').count() == 0,
         f'{url_before} → {back_url}')
    page.goto(APP + '/goal/achieve')
    settle(page)
    if page.get_by_role('button', name='목표 정하기').count():
        click(page, '목표 정하기')
        settle(page)
    else:
        page.goto(APP + '/')
        settle(page)
        if page.get_by_role('button', name='목표 정하기').count():
            click(page, '목표 정하기')
            settle(page)
    c.ok('새 목표 만들기 화면', '/goal/new' in page.url, page.url)
    c.shot(page, '4새목표')
    ctx.close()


# ───────── S16: 계정 삭제 후 같은 이메일로 재가입 ─────────
def s16(b, c: Check):
    email, uid, gid = pending_giveup('S16', 0)
    sql(f"select app_private.settle_user('{uid}', now());")
    until = sql1(f"select suspended_until from public.profiles where user_id = '{uid}';")
    ctx, page = session_page(b, email)
    c.ok('삭제 전: 반성문 화면', '/suspended' in page.url, page.url)
    page.get_by_text('계정 삭제하기', exact=True).first.click()
    settle(page, 800)
    c.shot(page, '1삭제확인')
    click(page, '삭제하기')
    settle(page, 4000)
    c.ok('삭제 뒤 로그인(또는 온보딩) 화면', '/auth' in page.url or '/onboarding' in page.url, page.url)
    gone = sql1(f"select count(*) from auth.users where id = '{uid}';")
    da = sql1(f"select giveup_confirmed_count || ',' || suspended_until from public.deleted_accounts where email_hash = app_private.email_hash('{email}');")
    c.ok('DB 계정 삭제(auth.users 없음)', gone == '0', gone)
    c.ok('DB deleted_accounts 반영(횟수 1, 정지 종료일)', da == f'1,{until}', f'{da} / 기대 1,{until}')
    # 같은 이메일로 OTP 재가입
    if '/onboarding' in page.url:
        for _ in range(5):
            if page.get_by_role('button', name=AGREE, exact=True).count():
                break
            click(page, '다음 보기')
        click(page, AGREE)
        settle(page)
    page.get_by_placeholder('name@example.com').fill(email)
    for label in CONSENTS:
        page.get_by_text(label, exact=True).first.click()
    sent = time.time()
    click(page, '코드 받기')
    code = latest_otp(email, after=sent)
    page.wait_for_timeout(800)
    page.get_by_label('6자리 코드').first.fill(code)
    click(page, '로그인하기')
    settle(page, 3500)
    c.ok('재가입 뒤 반성문 화면(정지 승계)', '/suspended' in page.url and has(page, '이용 정지 중입니다'), page.url)
    c.shot(page, '2재가입')
    nuid = uid_of(email)
    r = sql1(f"select giveup_confirmed_count || ',' || suspended_until from public.profiles where user_id = '{nuid}';")
    c.ok('DB 새 프로필이 횟수와 정지 승계', nuid != uid and r == f'1,{until}', f'{r}')
    ctx.close()


# ───────── S17: 3일 연속 완료 ─────────
def s17(b, c: Check):
    email, uid, gid = user_with_goal('S17', 60, first_offset=-3)
    sql(f"""
      insert into public.days (goal_id, day, user_id, status, today_reason, phase, target_minutes, session_started_at,
                               active_seconds, retro_started_at, retro_seconds, completed_at)
      select '{gid}', app_private.day_key(now(), 'Asia/Seoul') - k, '{uid}', 'done',
             '카페 주문을 연습하는 ' || k || '일 전의 이유입니다. 꼭 해냅니다.', 'retro', 10,
             now() - make_interval(days => k, mins => 14), 600, now() - make_interval(days => k, mins => 4), 180,
             now() - make_interval(days => k)
      from generate_series(1, 3) k;
      insert into public.messages (user_id, goal_id, day, phase, role, text, created_at)
      select '{uid}', '{gid}', app_private.day_key(now(), 'Asia/Seoul') - k, 'B', r, t, now() - make_interval(days => k, mins => 10 - n)
      from generate_series(1, 3) k,
           (values (1, 'partner', 'Hi there! How can I help you today?'), (2, 'user', 'I''d like an iced latte, please.')) v(n, r, t);
      insert into public.items (goal_id, user_id, kind, base, ko, note, state, first_day)
      values ('{gid}', '{uid}', 'expression', 'I''d like …, please.', '…로 하고 싶습니다.', '정중하게 원하는 것을 말할 때', 'taught', app_private.day_key(now(), 'Asia/Seoul') - 3),
             ('{gid}', '{uid}', 'word', 'prefer', '더 좋아하다', '둘 중 고를 때', 'taught', app_private.day_key(now(), 'Asia/Seoul') - 2);
      insert into public.item_events (user_id, item_id, day, phase, kind)
      select '{uid}', i.id, i.first_day, 'B', 'taught' from public.items i where i.goal_id = '{gid}';
      update public.goals set coupon_progress_days = 3 where id = '{gid}';
    """)
    ctx, page = session_page(b, email)
    c.ok('홈 연속 3일', has(page, '연속 3일'), text(page)[:120].replace('\n', ' / '))
    page.get_by_text('기록', exact=True).last.click()
    settle(page, 2000)
    body = text(page)
    cards = re.findall(r'(\d+월 \d+일)\s+10분', body)
    c.ok('기록 탭에 성과 문장', '지금까지 단어 1개와 표현 1개를 배웠습니다.' in body, '')
    c.ok('기록 탭에 카드 3장', len(cards) == 3, ', '.join(cards))
    marks = page.get_by_label(re.compile(r'\d+월 \d+일 완료')).count()
    c.ok('달력에 완료 표시 3칸', marks == 3, str(marks))
    c.shot(page, '기록')
    n = sql1(f"select count(*) from public.days where goal_id = '{gid}' and status = 'done';")
    c.ok('DB done 3행', n == '3', n)
    ctx.close()


ALL = {f'S{i}': f for i, f in enumerate([s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17], start=1)}


def main():
    want = sys.argv[1:] or list(ALL)
    old = json.loads(RESULTS.read_text('utf-8')) if RESULTS.exists() else {}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for sid in want:
            print(f'== {sid}')
            c = Check(sid)
            try:
                ALL[sid](b, c)
            except Exception as e:  # noqa: BLE001
                traceback.print_exc()
                c.ok('실행 오류', False, f'{type(e).__name__}: {str(e)[:300]}')
            old[sid] = {'items': c.items, 'shots': c.shots, 'at': time.strftime('%Y-%m-%d %H:%M:%S')}
            RESULTS.write_text(json.dumps(old, ensure_ascii=False, indent=1), 'utf-8')
        b.close()


if __name__ == '__main__':
    main()
