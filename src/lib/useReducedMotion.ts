import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useReducedMotionAtStart } from 'react-native-reanimated';

/**
 * 줄인 움직임 설정. Reanimated 값은 앱 시작 때 값만 주므로(영향지도 B-3) 첫 값으로 쓰고,
 * 바뀌면 AccessibilityInfo 이벤트로 따라간다. 웹은 react-native-web이 matchMedia로 같은 이벤트를 준다.
 */
export function useReducedMotion(): boolean {
  const initial = useReducedMotionAtStart();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub?.remove();
  }, []);
  return reduced;
}
