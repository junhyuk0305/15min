import { router } from 'expo-router';
import { useState } from 'react';
import { BotPicker, EMPTY_DRAFT, GoalFields, ScheduleFields, goalPartValid, type GoalDraft } from '@/components/GoalForm';
import { Body, Button, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { useApp } from '@/lib/store';

// 달성 직후나 포기가 확정된 뒤에 온다. 닫기 버튼이 없다.
export default function NewGoal() {
  const last = useApp((s) => s.goals.filter((g) => g.status !== 'given_up').at(-1));
  const [draft, setDraft] = useState<GoalDraft>(
    last ? { ...EMPTY_DRAFT, startMinutes: last.startMinutes, targetMinutes: last.targetMinutes, botId: last.botId } : EMPTY_DRAFT,
  );
  const createGoal = useApp((s) => s.createGoal);

  const start = () => {
    createGoal(draft);
    router.replace('/');
  };

  return (
    <Screen footer={<Button title={copy.newGoal.start} onPress={start} disabled={!goalPartValid(draft)} />}>
      <H1>{copy.newGoal.title}</H1>
      <Body muted>{copy.newGoal.sub}</Body>
      <GoalFields draft={draft} onChange={setDraft} />
      <ScheduleFields startMinutes={draft.startMinutes} targetMinutes={draft.targetMinutes} onChange={(v) => setDraft({ ...draft, ...v })} />
      <BotPicker value={draft.botId} onChange={(botId) => setDraft({ ...draft, botId })} />
    </Screen>
  );
}
