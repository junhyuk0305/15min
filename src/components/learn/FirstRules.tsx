import { Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhaseBar } from '@/components/learn/LearnShell';
import { SurfaceProvider } from '@/components/surface';
import { Body, Button, H1, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { phaseBar, phaseName, phasePlan } from '@/lib/learn';
import { FRAME_MAX, PALETTES, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const tp = copy.tips;
const p = PALETTES.white;

/**
 * 첫 학습 규칙 모달(갭분석 3.1-4, P0). 첫 학습에서 시계가 돌기 전에 한 번 뜬다.
 * 건너뛰기가 없다. "시작하기"로만 닫고 Android 뒤로도 닫지 않는다. 막대 그림은 그날 단계 시간(phasePlan)과 회고 3분이다.
 */
export function FirstRules({ visible, targetMinutes, levelCheck, onStart }: { visible: boolean; targetMinutes: number; levelCheck: boolean; onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} animationType={reduced ? 'none' : 'fade'} onRequestClose={() => undefined}>
      <SurfaceProvider theme="white">
        <View style={{ flex: 1, backgroundColor: p.bg }}>
          <View style={{ flex: 1, width: '100%', maxWidth: FRAME_MAX, alignSelf: 'center', paddingTop: insets.top + S.lg, paddingBottom: insets.bottom + S.md }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.lg }}>
              <H1>{tp.rulesTitle}</H1>
              <View style={{ gap: S.sm }}>
                <Label>{tp.rulesPlan}</Label>
                <PhaseBar cells={phaseBar(targetMinutes, 0)} />
                {phasePlan(targetMinutes).map((s) => (
                  <View key={s.phase} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                    <Text style={[T.body, { flex: 1, color: p.ink }]}>{phaseName(s.phase, levelCheck)}</Text>
                    <Text style={[T.body, { color: p.ink }]}>{copy.session.planTime(s.seconds)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ gap: S.sm }}>
                {tp.rules.map((r) => (
                  <Body key={r}>{r}</Body>
                ))}
              </View>
            </ScrollView>
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
              <Button title={tp.start} onPress={onStart} />
            </View>
          </View>
        </View>
      </SurfaceProvider>
    </Modal>
  );
}
