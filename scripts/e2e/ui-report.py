# MP 7.5-9: ui-states.py 메타로 화면별 주 버튼(채운 큰 버튼) 수, 글자 버튼, 44pt 미만 터치 영역을 센다.
# 사용: python ui-report.py <메타 폴더>
import glob, json, os, sys

CARD = 'rgb(251, 249, 244)'
rows, small = [], []
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.json'))):
    if os.path.basename(f) == 'checks.json':
        continue
    d = json.load(open(f, encoding='utf-8'))
    bs = [b for b in d['buttons'] if not b['offscreen']]
    prim = [b for b in bs if b['h'] >= 48 and b['bg'] not in ('rgba(0, 0, 0, 0)', CARD)]
    # 글자 버튼(TextButton): 채움과 테두리 없이 굵은 15px 글자. U2부터 밑줄은 본문 링크(role=link)에만 있다
    text = [b for b in bs if b['bg'] == 'rgba(0, 0, 0, 0)' and b['bw'] == '0px' and b['name'] and b['fs'] == '15px' and 'ExtraBold' in b.get('ff', '')]
    outline = [b for b in bs if b['h'] >= 48 and b['bg'] == 'rgba(0, 0, 0, 0)' and b['bw'] not in ('0px',) and b not in text]
    for b in bs:
        if (b['w'] < 44 or b['h'] < 44) and b['role'] != 'tab':
            small.append((d['name'], b['name'] or b['label'], b['w'], b['h']))
    def nm(b):
        n = b['name'] or b['label'] or ''
        return n + ('(비활성)' if b['disabled'] else '')
    rows.append((d['name'], len(prim), ', '.join(nm(b) for b in prim), ', '.join(nm(b) for b in text), ', '.join(nm(b) for b in outline),
                 [b['y'] + b['h'] for b in prim], d['h']))
print('화면 | 주 버튼 수 | 이름 | 글자 버튼 | 테두리 버튼 | 주 버튼 아래 끝(y) / 화면 높이')
for r in rows:
    print(' | '.join(str(x) for x in r))
print('\n## 44 미만')
for s in sorted(set(small)):
    print(s)
