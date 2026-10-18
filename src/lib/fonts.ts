import { NotoSansKR_500Medium } from '@expo-google-fonts/noto-sans-kr/500Medium';
import { NotoSansKR_800ExtraBold } from '@expo-google-fonts/noto-sans-kr/800ExtraBold';
import { NotoSerifKR_400Regular } from '@expo-google-fonts/noto-serif-kr/400Regular';
import { NotoSerifKR_900Black } from '@expo-google-fonts/noto-serif-kr/900Black';
import { useFonts } from 'expo-font';
import { F } from '@/lib/theme';

// 굵기마다 경로를 따로 불러온다. 패키지 루트에서 불러오면 모든 굵기 파일이 번들에 들어간다.
// 고딕 500, 800 / 명조 400, 900 네 개만 쓴다. 명조 한 굵기가 14MB라 더 늘리지 않는다.
const MAP = {
  [F.sans]: NotoSansKR_500Medium,
  [F.sansBold]: NotoSansKR_800ExtraBold,
  [F.serif]: NotoSerifKR_400Regular,
  [F.serifBlack]: NotoSerifKR_900Black,
};

/** 글꼴을 다 불러왔거나 실패했으면 true. 실패하면 시스템 글꼴로 그린다 */
export function useFontsReady(): boolean {
  const [loaded, error] = useFonts(MAP);
  return loaded || error !== null;
}
