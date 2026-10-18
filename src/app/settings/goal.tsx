import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Chip } from '@/components/goal/Chip';
import { clampTarget, MINUTE_PRESETS, setMinute, toggleWeekday, WEEKDAY_ORDER, weekdaysShort, wrapDay } from '@/components/goal/logic';
import { ErrorLine } from '@/components/ErrorLine';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Card, H1, Label, Screen, Stepper } from '@/components/ui';
import { copy } from '@/lib/copy';
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
  const [confirmShrink, setConfirmShrink] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!goal || !base) return null; // route.ts가 홈으로 보낸다

  const pendingGiveup = goal.giveupRequestedAt !== null;
  const changed = v.startMinutes !== base.startMinutes || v.targetMinutes !== base.targetMinutes || !sameDays(v.weekdays, base.weekdays);
  const short = weekdaysShort(v.weekdays);
  const shrinking = v.targetMinutes < base.targetMinutes;
  const edit = (patch: Partial<Sched>) => {
    setV({ ...v, ...patch });
    setConfirmShrink(false);
    setSaved(false);
  };

  const save = async () => {
    // 학습 분을 줄이면 긁는 확인을 한 번 거친다 (기획서 5.3)
    if (shrinking && !confirmShrink) {
      setConfirmShrink(true);
      return;
    }
    const ok = await saveAction.run(async () => {
      await state.changeSchedule(v.startMinutes, v.targetMinutes, v.weekdays);
      return true;
    });
    if (!ok) return;
    setConfirmShrink(false);
    setSaved(true);
  };

  const reason = pendingGiveup
    ? t.giveupPending
    : short > 0
      ? t.weekdaysShort(short)
      : !changed
        ? saved
          ? t.saved
          : t.noChange
        : crossesBoundary(v.startMinutes, v.targetMinutes)
          ? copy.goalSetup.boundary
          : null;
  const minute = v.startMinutes % 60;

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={saveAction.message} />
          {/* 줄이기 확인은 누를 버튼 바로 위에 둔다(작은 화면에서도 보이게) */}
          {confirmShrink ? <Text style={[T.h2, { color: C.redText }]}>{t.shrink(base.targetMinutes, v.targetMinutes)}</Text> : null}
          <Button
            title={confirmShrink ? t.shrinkYes : t.save}
            onPress={() => void save()}
            busy={saveAction.busy}
            disabled={!!reason}
            disabledReason={reason}
          />
          {pendingGiveup ? null : <TextButton title={t.giveupEntry} tone="danger" onPress={() => router.push('/settings/giveup')} />}
        </>
      }
    >
      <TextButton
        title={t.backToSettings}
        tone="sub"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
      />
      <H1>{t.goal}</H1>
      <Card>
        <Label>{t.nameLabel}</Label>
        <Body>{goal.name}</Body>
        <View style={{ height: S.sm }} />
        <Label>{t.reasonLabel}</Label>
        <Body serif>{goal.reason}</Body>
        <Text style={[T.small, { color: C.sub, marginTop: S.xs }]}>{t.locked}</Text>
      </Card>

      <View style={{ gap: S.sm }}>
        <Stepper
          label={t.hourLabel}
          display={fmtClock(v.startMinutes).slice(0, 2)}
          onMinus={() => edit({ startMinutes: wrapDay(v.startMinutes - 60) })}
          onPlus={() => edit({ startMinutes: wrapDay(v.startMinutes + 60) })}
        />
        <Stepper
          label={t.minuteLabel}
          display={fmtClock(v.startMinutes).slice(3)}
          onMinus={() => edit({ startMinutes: wrapDay(v.startMinutes - 1) })}
          onPlus={() => edit({ startMinutes: wrapDay(v.startMinutes + 1) })}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {MINUTE_PRESETS.map((m) => (
            <Chip
              key={m}
              role="radio"
              label={`:${String(m).padStart(2, '0')}`}
              accessibilityLabel={`${t.minuteLabel} ${m}`}
              on={minute === m}
              onPress={() => edit({ startMinutes: setMinute(v.startMinutes, m) })}
            />
          ))}
        </View>
      </View>

      <Stepper
        label={t.minutesLabel}
        display={copy.unit.minutes(v.targetMinutes)}
        onMinus={() => edit({ targetMinutes: clampTarget(v.targetMinutes - 1) })}
        onPlus={() => edit({ targetMinutes: clampTarget(v.targetMinutes + 1) })}
      />

      <View style={{ gap: S.sm }}>
        <Label>{t.weekdaysLabel}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {WEEKDAY_ORDER.map((w) => (
            <Chip
              key={w}
              role="checkbox"
              label={t.weekdayNames[w]}
              on={v.weekdays.includes(w)}
              onPress={() => edit({ weekdays: toggleWeekday(v.weekdays, w) })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: S.xs }}>
        <Text style={[T.small, { color: C.sub }]}>{t.changeNote}</Text>
        {goal.pendingChange ? (
          <Text style={T.small}>
            {t.pendingFull(fmtClock(goal.pendingChange.startMinutes), goal.pendingChange.targetMinutes, goal.pendingChange.weekdays.length)}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
