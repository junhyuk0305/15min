import { useEffect, useState, type RefObject } from 'react';
import { Modal, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SurfaceProvider } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Button } from '@/components/ui';
import { copy } from '@/lib/copy';
import { enter } from '@/lib/motion';
import { B, PALETTES, R, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type CoachStep = {
  /** 가리킬 대상. measureInWindow로 위치를 잰다 */
  target: RefObject<View | null>;
  text: string;
};

type Box = { x: number; y: number; w: number; h: number };

const DIM = 'rgba(0,0,0,0.6)';
const PAD = 6;
const BUBBLE_MAX = 320;

/**
 * 코치마크(갭분석 3.1 3번). 대상 둘레만 뚫린 덮개와 말풍선을 차례로 보인다.
 * 덮개는 대상 위, 아래, 왼쪽, 오른쪽 네 조각으로 만든다(웹에서도 같다).
 * 버튼은 "건너뛰기"(skippable일 때)와 "다음". 마지막 단계는 "닫기".
 * 학습 시계가 도는 동안에는 띄우지 않는다(3절). 그 판단은 부르는 쪽이 한다.
 */
export function Coachmark({
  steps,
  visible,
  onDone,
  skippable = true,
}: {
  steps: CoachStep[];
  visible: boolean;
  /** 마지막 단계를 넘기거나 건너뛰면 부른다 */
  onDone: () => void;
  skippable?: boolean;
}) {
  const win = useWindowDimensions();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  // 잰 위치. 어느 단계의 위치인지 같이 둔다
  const [measured, setMeasured] = useState<{ i: number; box: Box } | null>(null);
  // 닫히면 처음 단계로 되돌린다(렌더 중 상태 맞추기)
  if (!visible && i !== 0) setI(0);
  const step = steps[i];
  // 부르는 쪽(홈)은 1초마다 다시 그려지며 steps를 새로 만든다. 단계 객체 대신 고정된 ref로 기다려 1초마다 다시 재지 않는다(UXP 6.3)
  const target = step?.target;

  useEffect(() => {
    if (!visible || !target) return;
    // 첫 그림이 끝난 뒤에 잰다
    const id = requestAnimationFrame(() => {
      target.current?.measureInWindow((x, y, w, h) => setMeasured({ i, box: { x, y, w, h } }));
    });
    return () => cancelAnimationFrame(id);
  }, [visible, target, i, win.width, win.height]);

  if (!visible || !step) return null;
  const box = measured && measured.i === i ? measured.box : null;
  const last = i === steps.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));
  const p = PALETTES.ivory;

  let hole: Box | null = null;
  let bubbleTop = win.height / 2;
  let below = true;
  if (box) {
    hole = { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 };
    below = hole.y + hole.h < win.height * 0.6;
    bubbleTop = below ? hole.y + hole.h + S.sm : hole.y - S.sm;
  }
  const bubbleLeft = Math.max(S.md, Math.min(box ? box.x : S.md, win.width - BUBBLE_MAX - S.md));

  return (
    // 줄인 움직임이면 덮개도 페이드 없이 뜬다(4.1). 말풍선 entering은 Reanimated가 기기 설정을 따라 끈다
    <Modal transparent visible animationType={reduced ? 'none' : 'fade'} statusBarTranslucent onRequestClose={skippable ? onDone : next}>
      <SurfaceProvider theme="ivory">
        <View style={{ flex: 1 }}>
          {hole ? (
            <>
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, hole.y), backgroundColor: DIM }} />
              <View style={{ position: 'absolute', left: 0, right: 0, top: hole.y + hole.h, bottom: 0, backgroundColor: DIM }} />
              <View style={{ position: 'absolute', left: 0, width: Math.max(0, hole.x), top: hole.y, height: hole.h, backgroundColor: DIM }} />
              <View style={{ position: 'absolute', left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h, backgroundColor: DIM }} />
              <View
                pointerEvents="none"
                style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: R.lg, borderWidth: B.base, borderColor: p.onInk }}
              />
            </>
          ) : (
            <View style={{ flex: 1, backgroundColor: DIM }} />
          )}
          <Animated.View
            key={i}
            entering={enter.fade}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
            style={[
              {
                position: 'absolute',
                left: bubbleLeft,
                width: Math.min(BUBBLE_MAX, win.width - S.md * 2),
                backgroundColor: p.card,
                borderRadius: R.xl,
                padding: S.md,
                gap: S.sm,
              },
              below ? { top: bubbleTop } : { bottom: win.height - bubbleTop },
            ]}
          >
            <Text style={[T.body, { color: p.ink }]}>{step.text}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: skippable && !last ? 'space-between' : 'flex-end', gap: S.sm }}>
              {skippable && !last ? <TextButton title={copy.ux.skip} tone="sub" onPress={onDone} style={{ alignSelf: 'auto' }} /> : null}
              <Button title={last ? copy.ux.close : copy.ux.next} kind="secondary" onPress={next} style={{ minWidth: 96 }} />
            </View>
          </Animated.View>
        </View>
      </SurfaceProvider>
    </Modal>
  );
}
