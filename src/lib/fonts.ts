import { useFonts } from 'expo-font';
import { F } from '@/lib/theme';

// assets/fonts는 scripts/subset-fonts.py로 줄인 서브셋이다(KS X 1001 한글 2,350자 + 앱 문구 글자 + 라틴).
// 원본 Noto 전체 굵기는 한 개에 6~14MB라 그대로 넣지 않는다. 목록에 없는 드문 글자는 시스템 글꼴로 그려진다.
// 고딕 500, 800 / 명조 400, 900 네 개만 쓴다.
const MAP = {
  [F.sans]: require('../../assets/fonts/NotoSansKR-Medium.ttf'),
  [F.sansBold]: require('../../assets/fonts/NotoSansKR-ExtraBold.ttf'),
  [F.serif]: require('../../assets/fonts/NotoSerifKR-Regular.ttf'),
  [F.serifBlack]: require('../../assets/fonts/NotoSerifKR-Black.ttf'),
};

/** 글꼴을 다 불러왔거나 실패했으면 true. 실패하면 시스템 글꼴로 그린다 */
export function useFontsReady(): boolean {
  const [loaded, error] = useFonts(MAP);
  return loaded || error !== null;
}
