"""시나리오 검증(MP 7.2) 공용 도구. 로컬 Supabase와 Expo 웹 서버(기본 8101)를 쓴다.

- sql(): supabase_db_yourtime 컨테이너의 psql로 SQL을 실행한다(UTF-8 stdin).
- make_user(): 시드와 같은 방식으로 비밀번호 사용자를 만든다. 가입 트리거가 프로필을 만든다.
- session_for(): GoTrue 비밀번호 로그인으로 세션을 받는다. 앱 화면의 비밀번호 입력은 심사 계정에만 보이므로
  테스트는 세션을 localStorage에 직접 넣는다(supabase-js 웹 기본 저장소).
- open_app(): 390px 폭, Asia/Seoul 시간대 브라우저 컨텍스트에 세션과 온보딩 완료 표시를 넣고 연다.
- latest_otp(): Mailpit에서 그 주소로 온 마지막 6자리 코드를 읽는다.
키는 `npx supabase status -o env`에서 읽고 출력하지 않는다.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'docs' / '시나리오'
APP = os.environ.get('E2E_APP_URL', 'http://localhost:8101')
DB_CONTAINER = 'supabase_db_yourtime'
STORAGE_KEY = 'sb-127-auth-token'
CACHE_KEY = 'graego-cache-v3'
VIEWPORT = {'width': 390, 'height': 844}

_env: dict[str, str] | None = None


def env() -> dict[str, str]:
    global _env
    if _env is None:
        out = subprocess.run('npx supabase status -o env', cwd=ROOT, shell=True, capture_output=True, text=True).stdout
        _env = {m.group(1): m.group(2) for m in re.finditer(r'^([A-Z_]+)="?([^"\n]*)"?$', out, re.M)}
    return _env


def sql(q: str) -> str:
    r = subprocess.run(
        ['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-At', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
        input=q.encode('utf-8'), capture_output=True,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode('utf-8', 'replace'))
    return r.stdout.decode('utf-8').strip()


def sql1(q: str) -> str:
    """마지막 줄(마지막 SELECT 결과)만"""
    out = sql(q)
    return out.splitlines()[-1] if out else ''


def make_user(email: str, password: str = 'local-e2e-only') -> str:
    """같은 이메일 사용자가 있으면 지우고(탈퇴 기록은 그대로) 새로 만든다. user_id를 돌려준다."""
    return sql1(f"""
      delete from auth.users where lower(email) = lower('{email}');
      with u as (
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, phone_change, phone_change_token, reauthentication_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '{email}',
          extensions.crypt('{password}', extensions.gen_salt('bf')), now(),
          '{{"provider": "email", "providers": ["email"]}}',
          '{{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul", "terms_version": "2026-10-18"}}',
          now(), now(), '', '', '', '', '', '', '', ''
        ) returning id
      ), i as (
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        select gen_random_uuid(), u.id, u.id::text,
               jsonb_build_object('sub', u.id::text, 'email', '{email}', 'email_verified', true), 'email', now(), now(), now()
        from u
      )
      select id from u;
    """)


def clear_deleted(email: str) -> None:
    sql(f"delete from public.deleted_accounts where email_hash = app_private.email_hash('{email}');")


def make_goal(uid: str, start_minutes: int, *, target: int = 10, period: int = 14,
              weekdays: str = '{0,1,2,3,4,5,6}', first_offset: int = 0) -> str:
    """오늘 하루 키 + first_offset을 첫 학습일로 둔 목표. 생성 RPC를 부른 뒤 first_day를 옮긴다(시간 이동)."""
    return sql1(f"""
      select (app_private.create_goal(
        '{uid}', '카페에서 영어로 주문하기',
        '해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다. 다음에는 혼자 주문하고 싶습니다.',
        {period}, '{weekdays}', {start_minutes}, {target},
        '{{"place": "카페", "my_role": "손님", "partner": "바리스타", "task": "원하는 음료를 주문하고 받기"}}',
        '["입장과 인사", "메뉴 묻기", "음료 주문", "옵션 고르기", "결제", "음료 받기"]', now())).id;
      update public.goals
      set first_day = app_private.day_key(now(), 'Asia/Seoul') + {first_offset},
          settled_day = app_private.day_key(now(), 'Asia/Seoul') + {first_offset} - 1,
          created_at = now() - make_interval(days => greatest(1, 1 - {first_offset}))
      where user_id = '{uid}' and status = 'active'
      returning id;
    """)


def now_minutes(delta: int = 0) -> int:
    """지금 KST 시각(분) + delta"""
    return int(sql1(f"select (extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul'))::int + {delta};"))


def today() -> str:
    return sql1("select app_private.day_key(now(), 'Asia/Seoul');")


def _post(url: str, body: dict, token: str | None = None) -> dict:
    e = env()
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST')
    req.add_header('content-type', 'application/json')
    req.add_header('apikey', e['ANON_KEY'])
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def session_for(email: str, password: str = 'local-e2e-only') -> dict:
    return _post(f"{env()['API_URL']}/auth/v1/token?grant_type=password", {'email': email, 'password': password})


def latest_otp(email: str, after: float = 0, timeout: float = 30) -> str:
    base = env().get('MAILPIT_URL') or env()['INBUCKET_URL']
    end = time.time() + timeout
    while time.time() < end:
        with urllib.request.urlopen(f'{base}/api/v1/search?query=to:{email}&limit=5') as r:
            data = json.loads(r.read())
        for m in data.get('messages', []):
            created = m.get('Created', '')
            ts = time.mktime(time.strptime(created[:19], '%Y-%m-%dT%H:%M:%S')) - time.timezone if created else 0
            if ts + 2 < after:
                continue
            with urllib.request.urlopen(f"{base}/api/v1/message/{m['ID']}") as r2:
                body = json.loads(r2.read())
            code = re.search(r'\b(\d{6})\b', body.get('Text', '') or body.get('HTML', ''))
            if code:
                return code.group(1)
        time.sleep(1)
    raise TimeoutError(f'OTP for {email} not found')


def new_context(browser, session: dict | None = None, onboarded: bool = True):
    ctx = browser.new_context(viewport=VIEWPORT, timezone_id='Asia/Seoul', locale='ko-KR', device_scale_factor=1)
    seed = {}
    if session is not None:
        seed[STORAGE_KEY] = json.dumps(session)
    if onboarded:
        seed[CACHE_KEY] = json.dumps({'state': {'onboarded': True}, 'version': 0})
    if seed:
        # 첫 로드에만 넣는다. 새로고침(강제 종료 흉내)은 앱이 저장한 값을 그대로 쓴다.
        ctx.add_init_script(f"""
          (() => {{
            const seed = {json.dumps(seed)};
            if (!sessionStorage.getItem('__e2e_seeded')) {{
              for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
              sessionStorage.setItem('__e2e_seeded', '1');
            }}
          }})();
        """)
    return ctx


def open_app(browser, session: dict | None = None, path: str = '/', onboarded: bool = True):
    ctx = new_context(browser, session, onboarded)
    page = ctx.new_page()
    page.console_errors = []  # type: ignore[attr-defined]
    page.on('console', lambda m: m.type == 'error' and page.console_errors.append(m.text))  # type: ignore[attr-defined]
    page.goto(APP + path)
    settle(page)
    return ctx, page


def settle(page, ms: int = 1500):
    try:
        page.wait_for_load_state('networkidle', timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(ms)


def shot(page, name: str):
    SHOTS.mkdir(parents=True, exist_ok=True)
    path = SHOTS / f'{name}.png'
    page.screenshot(path=str(path))
    return path.name


def text(page) -> str:
    return page.inner_text('body')


def has(page, s: str) -> bool:
    return s in text(page)


def wait_text(page, s: str, timeout: int = 20000) -> bool:
    try:
        page.get_by_text(s, exact=False).first.wait_for(timeout=timeout)
        return True
    except Exception:
        return False
