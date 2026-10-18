import { ScrollView, Text, View } from 'react-native';
import { Gauge, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import type { GoalSetupFields } from '@/lib/model';
import { B, C, S, T } from '@/lib/theme';
import { FIELD_ORDER, progressOf, stepOf, type SetupStage } from './logic';

const g = copy.goalSetup;

/** 단계 표시(1/3 ~ 3/3), 진행 막대, 지금까지 채운 항목 */
export function SetupHeader({ stage, fields }: { stage: SetupStage; fields: GoalSetupFields }) {
  const step = stepOf(stage);
  const shown = FIELD_ORDER.filter((k) => fields[k]?.trim());
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
        <Label>{g.title}</Label>
        <Label>{g.step(step, g.steps[step - 1])}</Label>
      </View>
      <View style={{ marginTop: 6 }}>
        <Gauge ratio={progressOf(stage, fields)} />
      </View>
      {stage === 'chat' && shown.length ? (
        // 한 줄로 두고 옆으로 넘긴다. 채팅 자리를 덜 차지한다
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: S.xs, flexGrow: 0 }}
          contentContainerStyle={{ gap: 6 }}
          accessibilityLabel={shown.map((k) => `${g.fields[k]} ${fields[k]}`).join(', ')}
        >
          {shown.map((k) => (
            <View key={k} style={{ flexDirection: 'row', borderWidth: B.hair, borderColor: C.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, gap: 6 }}>
              <Text style={[T.small, { color: C.sub, fontSize: 12 }]}>{g.fields[k]}</Text>
              <Text numberOfLines={1} style={[T.small, { color: C.ink, fontSize: 12, flexShrink: 1, maxWidth: 180 }]}>
                {fields[k]}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </>
  );
}
