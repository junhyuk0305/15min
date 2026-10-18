import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Header } from '@/components/Header';
import { Gauge, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import type { GoalSetupFields } from '@/lib/model';
import { B, C, S, T } from '@/lib/theme';
import { FIELD_ORDER, progressOf, stepOf, type SetupStage } from './logic';

const g = copy.goalSetup;

/**
 * 공통 헤더(제목 "목표 정하기"), 단계 표시(1/3 ~ 3/3), 진행 막대, 지금까지 채운 항목.
 * onBack이 있으면(2/3, 3/3) 왼쪽 chevron이 앞 단계로 간다. 1/3 채팅은 강제 화면이라 chevron 없이 이유 한 줄을 둔다(갭분석 N6).
 * right는 헤더 오른쪽 슬롯(1/3 채팅의 "⋯" 신고 메뉴).
 */
export function SetupHeader({ stage, fields, onBack, right }: { stage: SetupStage; fields: GoalSetupFields; onBack?: () => void; right?: ReactNode }) {
  const step = stepOf(stage);
  const shown = FIELD_ORDER.filter((k) => fields[k]?.trim());
  return (
    <>
      <Header title={g.title} left={onBack ? 'back' : 'none'} onLeft={onBack} reason={onBack ? undefined : g.locked} right={right} />
      <View style={{ paddingHorizontal: S.lg, gap: 6 }}>
        <Label>{g.step(step, g.steps[step - 1])}</Label>
        <Gauge ratio={progressOf(stage, fields)} />
      </View>
      {stage === 'chat' && shown.length ? (
        // 한 줄로 두고 옆으로 넘긴다. 채팅 자리를 덜 차지한다
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: S.xs, flexGrow: 0 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: S.lg }}
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
