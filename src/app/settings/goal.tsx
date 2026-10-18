import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ScheduleFields } from '@/components/GoalForm';
import { Body, Button, Card, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { fmtClock } from '@/lib/rules';
import { activeGoalOf, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.settings;

export default function GoalSettings() {
  const state = useApp();
  const goal = activeGoalOf(state);
  const base = goal?.pendingChange ?? goal;
  const [v, setV] = useState({ startMinutes: base?.startMinutes ?? 0, targetMinutes: base?.targetMinutes ?? 15 });
  const [confirmShrink, setConfirmShrink] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!goal) return null;

  const changed = v.startMinutes !== (base?.startMinutes ?? 0) || v.targetMinutes !== (base?.targetMinutes ?? 0);
  const shrinking = v.targetMinutes < goal.targetMinutes;

  const save = () => {
    if (shrinking && !confirmShrink) {
      setConfirmShrink(true);
      return;
    }
    state.changeSchedule(v.startMinutes, v.targetMinutes);
    setConfirmShrink(false);
    setSaved(true);
  };

  return (
    <Screen
      footer={
        <>
          <Button title={confirmShrink ? t.shrinkYes : saved && !changed ? t.saved : t.save} onPress={save} disabled={!changed && !confirmShrink} kind={confirmShrink ? 'danger' : 'primary'} />
          <Button title={t.giveup} kind="secondary" onPress={() => router.push('/settings/giveup')} disabled={goal.giveupRequestedAt !== null} />
        </>
      }
    >
      <H1>{t.goal}</H1>
      <Card>
        <Label>{copy.goalForm.nameLabel}</Label>
        <Body>{goal.name}</Body>
        <Label>{copy.goalForm.reasonLabel}</Label>
        <Body>{goal.reason}</Body>
        <Text style={[T.small, { color: C.sub }]}>{copy.goalForm.reasonLocked}</Text>
      </Card>
      <ScheduleFields
        startMinutes={v.startMinutes}
        targetMinutes={v.targetMinutes}
        onChange={(n) => {
          setV(n);
          setConfirmShrink(false);
          setSaved(false);
        }}
      />
      <View style={{ gap: S.xs }}>
        <Text style={[T.small, { color: C.sub }]}>{t.changeNote}</Text>
        {goal.pendingChange ? (
          <Text style={T.small}>{t.pending(fmtClock(goal.pendingChange.startMinutes), goal.pendingChange.targetMinutes)}</Text>
        ) : null}
        {confirmShrink ? <Text style={[T.h2, { color: C.red }]}>{t.shrink(goal.targetMinutes, v.targetMinutes)}</Text> : null}
      </View>
    </Screen>
  );
}
