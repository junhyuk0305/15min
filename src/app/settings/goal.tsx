import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ScheduleFields } from '@/components/GoalForm';
import { ErrorLine } from '@/components/ErrorLine';
import { Body, Button, Card, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { fmtClock } from '@/lib/rules';
import { useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

const t = copy.settings;

export default function GoalSettings() {
  const state = useApp();
  const goal = state.goal;
  const saveAction = useAction();
  const base = goal?.pendingChange ?? goal;
  const [v, setV] = useState({ startMinutes: base?.startMinutes ?? 0, targetMinutes: base?.targetMinutes ?? 15 });
  const [confirmShrink, setConfirmShrink] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!goal) return null;

  const changed = v.startMinutes !== (base?.startMinutes ?? 0) || v.targetMinutes !== (base?.targetMinutes ?? 0);
  const shrinking = v.targetMinutes < goal.targetMinutes;

  const save = async () => {
    if (shrinking && !confirmShrink) {
      setConfirmShrink(true);
      return;
    }
    const weekdays = (goal.pendingChange ?? goal).weekdays;
    const ok = await saveAction.run(async () => {
      await state.changeSchedule(v.startMinutes, v.targetMinutes, weekdays);
      return true;
    });
    if (!ok) return;
    setConfirmShrink(false);
    setSaved(true);
  };

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={saveAction.message} />
          <Button
            title={confirmShrink ? t.shrinkYes : saved && !changed ? t.saved : t.save}
            onPress={() => void save()}
            busy={saveAction.busy}
            disabled={!changed && !confirmShrink}
            kind={confirmShrink ? 'danger' : 'primary'}
          />
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
