import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { clampTarget, toggleWeekday, weekdaysShort } from '@/components/goal/logic';
import { WeekdayCells } from '@/components/goal/PlanFields';
import { ConfirmSheet } from '@/components/BottomSheet';
import { ErrorLine } from '@/components/ErrorLine';
import { Header } from '@/components/Header';
import { TextButton } from '@/components/TextButton';
import { TimePicker } from '@/components/TimePicker';
import { showToast } from '@/components/Toast';
import { Body, Button, Card, Label, Screen, Stepper } from '@/components/ui';
import { copy } from '@/lib/copy';
import { success } from '@/lib/haptics';
import { crossesBoundary, fmtClock } from '@/lib/rules';
import { useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

const t = copy.settings;

type Sched = { startMinutes: number; targetMinutes: number; weekdays: number[] };

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** T2 목표 관리. 이름과 처음 이유는 읽기 전용. 시각, 학습 분, 학습 요일은 내일부터 적용 (기획서 5.3) */
export default function GoalSettings() {
  const state = useApp();
  const goal = state.goal;
  const saveAction = useAction();
  // 예약된 변경이 있으면 그 값에서 시작한다
  const base: Sched | null = goal ? (goal.pendingChange ?? goal) : null;
  const [v, setV] = useState<Sched>({
    startMinutes: base?.startMinutes ?? 0,
    targetMinutes: base?.targetMinutes ?? 15,
    weekdays: base?.weekdays ?? [],
  });
  // 학습 분을 줄일 때 저장을 누르면 뜨는 확인 시트(갭분석 7.3)
  const [askShrink, setAskShrink] = useState(false);
  if (!goal || !base) return null; // route.ts가 홈으로 보낸다

  const pendingGiveup = goal.giveupRequestedAt !== null;
  const changed = v.startMinutes !== base.startMinutes || v.targetMinutes !== base.targetMinutes || !sameDays(v.weekdays, base.weekdays);
  const short = weekdaysShort(v.weekdays);
  const shrinking = v.targetMinutes < base.targetMinutes;
  const edit = (patch: Partial<Sched>) => setV({ ...v, ...patch });

  const save = async () => {
    const ok = await saveAction.run(async () => {
      await state.changeSchedule(v.startMinutes, v.targetMinutes, v.weekdays);
      return true;
    });
    // 실패하면 시트를 내려 바닥의 오류 줄이 보이게 한다
    setAskShrink(false);
    if (!ok) return;
    showToast(t.savedToast);
    success();
  };
  // 학습 분을 줄이면 긁는 확인을 한 번 거친다 (기획서 5.3)
  const onSave = () => (shrinking ? setAskShrink(true) : void save());

  // 빨강 이유는 조건을 못 채웠을 때만 보인다. 바꾼 것이 없거나 포기 대기 중이면 이유 없이 비활성이다(3절 빨강 안내)
  const reason = pendingGiveup
    ? null
    : short > 0
      ? t.weekdaysShort(short)
      : changed && crossesBoundary(v.startMinutes, v.targetMinutes)
        ? copy.goalSetup.boundary
        : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <Screen
      header={<Header title={t.goal} onLeft={back} />}
      footer={
        <>
          <ErrorLine message={saveAction.message} />
          {pendingGiveup ? <Text style={[T.small, { color: C.sub, textAlign: 'center' }]}>{t.giveupPending}</Text> : null}
          <Button
            title={t.save}
            onPress={onSave}
            busy={saveAction.busy}
            disabled={pendingGiveup || !changed || !!reason}
            disabledReason={reason}
          />
          {pendingGiveup ? null : <TextButton title={t.giveupEntry} tone="danger" onPress={() => router.push('/settings/giveup')} />}
        </>
      }
    >
      <Card>
        <Label>{t.nameLabel}</Label>
        <Body>{goal.name}</Body>
        <View style={{ height: S.sm }} />
        <Label>{t.reasonLabel}</Label>
        <Body serif>{goal.reason}</Body>
        <Text style={[T.small, { color: C.sub, marginTop: S.xs }]}>{t.locked}</Text>
      </Card>

      <TimePicker value={v.startMinutes} onChange={(startMinutes) => edit({ startMinutes })} />

      <Stepper
        label={t.minutesLabel}
        display={copy.unit.minutes(v.targetMinutes)}
        onMinus={() => edit({ targetMinutes: clampTarget(v.targetMinutes - 1) })}
        onPlus={() => edit({ targetMinutes: clampTarget(v.targetMinutes + 1) })}
      />

      <View style={{ gap: S.sm }}>
        <Label>{t.weekdaysLabel}</Label>
        {/* 칩 7개는 390폭에서 두 줄로 넘쳐 "일"이 바닥 버튼에 가렸다. 목표 정하기 2/3과 같은 붙은 7칸으로 한 줄에 둔다(U9 M5) */}
        <WeekdayCells weekdays={v.weekdays} onToggle={(w) => edit({ weekdays: toggleWeekday(v.weekdays, w) })} />
      </View>

      <View style={{ gap: S.xs }}>
        <Text style={[T.small, { color: C.sub }]}>{t.changeNote}</Text>
        {goal.pendingChange ? (
          <Text style={T.small}>
            {t.pendingFull(fmtClock(goal.pendingChange.startMinutes), goal.pendingChange.targetMinutes, goal.pendingChange.weekdays.length)}
          </Text>
        ) : null}
      </View>

      <ConfirmSheet
        visible={askShrink}
        onClose={() => setAskShrink(false)}
        title={t.shrinkTitle}
        body={t.shrink(base.targetMinutes, v.targetMinutes)}
        primary={t.shrinkKeep}
        onPrimary={() => setAskShrink(false)}
        secondary={t.shrinkYes}
        onSecondary={() => void save()}
        danger
        busy={saveAction.busy}
      />
    </Screen>
  );
}
