"""한글 글꼴을 서브셋으로 줄인다. 원본은 node_modules/@expo-google-fonts.

남기는 글자: KS X 1001 한글 2,350자, 앱 문구(src/)에 실제로 쓰인 모든 글자,
라틴 기본과 확장, 문장 부호, 숫자 기호. 목록에 없는 드문 글자는 시스템 글꼴로 그려진다.
실행: python -I scripts/subset-fonts.py
"""
import pathlib
import re
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@expo-google-fonts"
OUT = ROOT / "assets" / "fonts"

FONTS = [
    ("noto-sans-kr/500Medium/NotoSansKR_500Medium.ttf", "NotoSansKR-Medium.ttf"),
    ("noto-sans-kr/800ExtraBold/NotoSansKR_800ExtraBold.ttf", "NotoSansKR-ExtraBold.ttf"),
    ("noto-serif-kr/400Regular/NotoSerifKR_400Regular.ttf", "NotoSerifKR-Regular.ttf"),
    ("noto-serif-kr/900Black/NotoSerifKR_900Black.ttf", "NotoSerifKR-Black.ttf"),
]


def ksx1001_hangul() -> set[int]:
    chars = set()
    for cp in range(0xAC00, 0xD7A4):
        try:
            if len(chr(cp).encode("euc-kr")) != 2:
                continue
            chars.add(cp)
        except UnicodeEncodeError:
            pass
    return chars


def used_in_src() -> set[int]:
    chars = set()
    for p in list((ROOT / "src").rglob("*.ts")) + list((ROOT / "src").rglob("*.tsx")):
        chars.update(ord(c) for c in p.read_text(encoding="utf-8") if ord(c) > 0x7F)
    return chars


def ranges() -> set[int]:
    out = set()
    for a, b in [
        (0x20, 0x7E),      # 라틴 기본
        (0xA0, 0x17F),     # 라틴 확장 A까지
        (0x2000, 0x206F),  # 문장 부호
        (0x2190, 0x21FF),  # 화살표
        (0x2460, 0x24FF),  # 동그라미 숫자
        (0x25A0, 0x25FF),  # 도형 (○ □)
        (0x3000, 0x303F),  # 한중일 기호
        (0x3131, 0x318E),  # 호환 자모
        (0xFF01, 0xFF5E),  # 전각 문자
    ]:
        out.update(range(a, b + 1))
    return out


def main() -> None:
    unicodes = sorted(ksx1001_hangul() | used_in_src() | ranges())
    OUT.mkdir(parents=True, exist_ok=True)
    for src, dst in FONTS:
        opts = subset.Options()
        opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
        opts.hinting = False
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        font = subset.load_font(str(SRC / src), opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        subset.save_font(font, str(OUT / dst), opts)
        print(dst, (OUT / dst).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
