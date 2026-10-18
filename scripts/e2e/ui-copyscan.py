# MP 7.6: ui-states.py가 남긴 화면 글자(메타 JSON)를 문구 규칙으로 훑는다.
# 사용: python ui-copyscan.py <메타 폴더>   결과: 규칙 위반 후보와 화면별 고유 문장 목록
import glob, json, os, re, sys
from collections import defaultdict

meta = sys.argv[1]
lines = defaultdict(set)
for f in sorted(glob.glob(os.path.join(meta, '*.json'))):
    if os.path.basename(f) == 'checks.json':
        continue  # ui-checks.py 결과(화면 글자가 아님)
    d = json.load(open(f, encoding='utf-8'))
    if d['name'].startswith('legal-normal') or d['name'].startswith('legal-offline'):
        continue  # 법무 원문은 copy.legal 별도 규칙
    for ln in d['text'].split('\n'):
        ln = ln.strip()
        if ln:
            lines[ln].add(d['name'])

FORBIDDEN = ['미션', '챌린지', '세션', '수업', '공부', '나의 이유', '목표 이유', '오늘 이유', '시작 이유', '소감', '리뷰', '봇', '선생님', '직원',
             '캐릭터', '예외 쿠폰', '생략권', '휴식권', '스트릭', '연속 일수', '휴일', '오프', '그만두기', '포기 취소', '차단', '정지 처분', '졸업', '당신']
RULES = [
    ('해요체', re.compile(r'[가-힣](요|죠)[.?!]?(\s|$)')),
    ('대시', re.compile(r'[가-힣A-Za-z0-9]\s*[—–]\s*[가-힣A-Za-z]')),
    ('가운뎃점', re.compile(r'·')),
    ('영어 오류', re.compile(r'(Error|error|ApiError|XX000|undefined|NaN|\[object|null\b|failed|Exception)')),
    ('AI 표기', re.compile(r'(?<![A-Za-z])AI(?![A-Za-z])')),
]
hits = []
for ln, where in lines.items():
    for w in FORBIDDEN:
        if w in ln:
            hits.append(('용어집:' + w, ln, where))
    for name, rx in RULES:
        if rx.search(ln):
            hits.append((name, ln, where))
print('## 위반 후보')
for k, ln, where in sorted(hits):
    print(f'- [{k}] {ln!r}  <- {", ".join(sorted(where)[:3])}{" ..." if len(where) > 3 else ""}')
print('\n## 한국어 문장 전체(고유)')
for ln in sorted(lines):
    if re.search(r'[가-힣]', ln):
        print(f'{ln}\t{len(lines[ln])}\t{sorted(lines[ln])[0]}')
