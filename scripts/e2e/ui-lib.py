# UI QA 공통 도우미. 로컬 Supabase(127.0.0.1:54621)와 Expo 웹(8102)을 쓴다. 키는 출력하지 않는다.
# 다른 파일에서: lib = load_lib()  (파일 이름에 '-'가 있어 importlib로 읽는다)
import datetime, json, os, re, subprocess, urllib.request, uuid

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SB = 'http://127.0.0.1:54621'
BASE = os.environ.get('UI_BASE', 'http://localhost:8102')
OUT = os.environ.get('UI_OUT') or os.path.join(REPO, 'docs', '화면상태')
TODAY = "app_private.day_key(now(), 'Asia/Seoul')"
KST = datetime.timezone(datetime.timedelta(hours=9))
_keys = {}


def keys():
    if not _keys:
        out = subprocess.run('npx supabase status -o env', cwd=REPO, shell=True, capture_output=True, text=True, encoding='utf-8').stdout
        for line in out.splitlines():
            m = re.match(r'^([A-Z_]+)="?(.*?)"?$', line.strip())
            if m:
                _keys[m.group(1)] = m.group(2)
    return _keys


def http(method, path, body=None, key=None, token=None):
    k = key or keys()['ANON_KEY']
    req = urllib.request.Request(SB + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('apikey', k)
    req.add_header('Authorization', 'Bearer ' + (token or k))
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def sql(q):
    r = subprocess.run(['docker', 'exec', '-i', 'supabase_db_yourtime', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-At'],
                       input=q, capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def ensure_user(email, pw='ui-qa-local-pw-1'):
    meta = {'age_confirmed': True, 'ai_consent': True, 'terms_version': '2026-10-18'}
    http('POST', '/auth/v1/admin/users', {'email': email, 'password': pw, 'email_confirm': True, 'user_metadata': meta}, key=keys()['SERVICE_ROLE_KEY'])
    return sql(f"select id from auth.users where email = '{email}';")


def session(email, pw='ui-qa-local-pw-1'):
    """비밀번호는 심사 계정만 쓴다(마이그레이션 000700). 관리자 매직링크 토큰으로 세션을 받는다"""
    st, j = http('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': pw})
    if st == 200:
        return j
    st, link = http('POST', '/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': email}, key=keys()['SERVICE_ROLE_KEY'])
    assert st == 200, (st, link)
    th = link.get('hashed_token') or link.get('properties', {}).get('hashed_token')
    st, j = http('POST', '/auth/v1/verify', {'type': 'magiclink', 'token_hash': th})
    assert st == 200 and 'access_token' in j, (st, j)
    return j


def now_min():
    n = datetime.datetime.now(KST)
    return n.hour * 60 + n.minute


class User:
    """한 테스트 계정. reset은 이 계정의 행만 지운다"""

    def __init__(self, email):
        self.email = email
        self.uid = ensure_user(email)

    def reset(self):
        u = self.uid
        sql(f"""
          delete from public.message_reports where user_id='{u}';
          delete from public.reflections where user_id='{u}';
          delete from public.item_events where user_id='{u}';
          delete from public.items where user_id='{u}';
          delete from public.messages where user_id='{u}';
          delete from public.days where user_id='{u}';
          delete from public.episodes where user_id='{u}';
          delete from public.ai_usage where user_id='{u}';
          delete from public.goals where user_id='{u}';
          update public.profiles set giveup_confirmed_count=0, suspended_until=null, suspended_goal_id=null, banned=false,
            suspended_start_minutes=null, suspended_target_minutes=null where user_id='{u}';
        """)

    def goal(self, start_off=90, target=15, weekdays='{0,1,2,3,4,5,6}', first=-3, period=14, coupons=3, giveup_h=None,
             progress_days=0, name='카페에서 영어로 주문하기', reason='해외 출장 때마다 손짓으로 주문하는 게 창피해서 다음에는 혼자 주문하고 싶습니다.',
             status='active', start_abs=None):
        start = start_abs if start_abs is not None else (now_min() + start_off) % 1440
        gu = f"now() - interval '{giveup_h} hours'" if giveup_h is not None else 'null'
        gid = str(uuid.uuid4())
        ended = 'now()' if status != 'active' else 'null'
        sql(f"""
          insert into public.goals (id, user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, subsituations,
            first_day, coupons, coupon_progress_days, settled_day, giveup_requested_at, created_at, status, ended_at)
          values ('{gid}', '{self.uid}', $n${name}$n$, $r${reason}$r$, {period}, '{weekdays}', {start}, {target},
            '{{"place":"카페","my_role":"손님","partner":"바리스타","task":"원하는 음료를 주문하고 받기"}}',
            '["입장과 인사","메뉴 묻기","음료 주문","옵션 고르기","결제","음료 받기"]',
            {TODAY} + {first}, {coupons}, {progress_days}, {TODAY} - 1, {gu}, now() - interval '{max(1, -first + 1)} days', '{status}', {ended});
          insert into public.episodes (goal_id, index, user_id, subsituations)
            select id, 0, user_id, subsituations from public.goals where id='{gid}';""")
        return gid

    def day(self, gid, off, status, active=0, reason='출장이 다음 주라서 더는 미룰 수 없어서 오늘도 앉습니다', phase=None, started_min=None,
            retro=0, target=15, retro_started=None):
        started = f"now() - interval '{started_min} minutes'" if started_min is not None else 'null'
        ph = f"'{phase}'" if phase else 'null'
        if retro_started is None:
            retro_started = bool(retro)
        retro_at = "now() - interval '5 minutes'" if retro_started else 'null'
        done_at = f"now() - interval '1 day' * {-off}" if status == 'done' else 'null'
        rs = f"$r${reason}$r$" if reason else 'null'
        sql(f"""insert into public.days (goal_id, day, user_id, status, today_reason, phase, target_minutes, session_started_at, active_seconds,
          retro_started_at, retro_seconds, completed_at)
          values ('{gid}', {TODAY} + {off}, '{self.uid}', '{status}', {rs}, {ph}, {target}, {started}, {active}, {retro_at}, {retro}, {done_at});""")

    def msg(self, gid, off, phase, role, text, meta='{}', sec=0):
        sql(f"""insert into public.messages (id, user_id, goal_id, day, phase, role, text, meta, created_at)
          values ('{uuid.uuid4()}', '{self.uid}', '{gid}', {TODAY} + {off}, '{phase}', '{role}', $t${text}$t$, $m${meta}$m$,
          now() - interval '1 day' * {-off} - interval '1 hour' + interval '1 second' * {sec});""")

    def item(self, gid, kind, base, ko, off=-2, events=('taught',), phase='B'):
        iid = str(uuid.uuid4())
        sql(f"""insert into public.items (id, user_id, goal_id, kind, base, ko, note, state, first_day)
          values ('{iid}', '{self.uid}', '{gid}', '{kind}', $b${base}$b$, $k${ko}$k$, '', 'taught', {TODAY} + {off});""")
        for ev in events:
            k, correct = (ev, 'null') if isinstance(ev, str) else ev
            sql(f"""insert into public.item_events (id, user_id, item_id, day, phase, kind, correct)
              values (gen_random_uuid(), '{self.uid}', '{iid}', {TODAY} + {off}, '{phase}', '{k}', {correct});""")
        return iid


def context(browser, user=None, w=390, h=844, scale=1, onboarded=True, extra_cache=None):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale, locale='ko-KR', timezone_id='Asia/Seoul', reduced_motion='reduce')
    init = ''
    if user is not None:
        sess = session(user.email)
        init += "if (!localStorage.getItem('sb-127-auth-token')) localStorage.setItem('sb-127-auth-token', %s);" % json.dumps(json.dumps(sess))
    if onboarded:
        init += "if (!localStorage.getItem('graego-cache-v3')) localStorage.setItem('graego-cache-v3', JSON.stringify({state:{onboarded:true},version:0}));"
    if init:
        ctx.add_init_script(init)
    return ctx


SUPA = '**/127.0.0.1:54621/**'


class Hold:
    """서버 요청을 붙잡아 두었다가 놓는다(로딩 상태). match가 URL에 있으면 붙잡는다"""

    def __init__(self, page, match=''):
        self.page, self.match, self.held, self.on = page, match, [], True
        page.route(SUPA, self._h)

    def _h(self, route):
        if self.on and self.match in route.request.url and route.request.method != 'OPTIONS':
            self.held.append(route)
        else:
            route.continue_()

    def release(self):
        self.on = False
        for r in self.held:
            try:
                r.continue_()
            except Exception:
                pass
        self.held = []
        self.page.unroute(SUPA, self._h)


def fail_server(page, match='', status=500):
    """서버 오류(5xx) 주입"""
    def h(route):
        if match in route.request.url and route.request.method != 'OPTIONS':
            route.fulfill(status=status, content_type='application/json', body='{"code":"XX000","message":"internal error","error":"server"}')
        else:
            route.continue_()
    page.route(SUPA, h)
    return h


def fail_network(page, match=''):
    def h(route):
        if match in route.request.url:
            route.abort('internetdisconnected')
        else:
            route.continue_()
    page.route(SUPA, h)
    return h


def visible_text(page):
    return page.inner_text('body')


def shot(page, name, wait=900, full=False):
    page.wait_for_timeout(wait)
    path = os.path.join(OUT, name + '.png')
    page.screenshot(path=path, full_page=full)
    return path
