import { useState } from 'react';
import { ErrorLine } from '@/components/ErrorLine';
import { EMPTY_DRAFT, GoalFields, ScheduleFields, SituationFields, draftToInput, goalPartValid, situationValid, type GoalDraft } from '@/components/GoalForm';
import { Body, Button, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';

// 목표가 없을 때 온다. 목표 설정 채팅(goal-setup)이 생기면 이 화면을 바꾼다. 만들면 route.ts가 홈으로 보낸다.
export default function NewGoal() {
  const last = useApp((s) => s.lastGoal);
  const [draft, setDraft] = useState<GoalDraft>(
    last
      ? {
          ...EMPTY_DRAFT,
          startMinutes: last.startMinutes,
          targetMinutes: last.targetMinutes,
          place: last.situation.place,
          myRole: last.situation.myRole,
          partner: last.situation.partner,
          task: last.situation.task,
        }
      : EMPTY_DRAFT,
  );
  const createGoal = useApp((s) => s.createGoal);
  const create = useAction();

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={create.message} />
          <Button
            title={copy.newGoal.start}
            busy={create.busy}
            onPress={() => void create.run(() => createGoal(draftToInput(draft)))}
            disabled={!goalPartValid(draft) || !situationValid(draft)}
          />
        </>
      }
    >
      <H1>{copy.newGoal.title}</H1>
      <Body muted>{copy.newGoal.sub}</Body>
      <GoalFields draft={draft} onChange={setDraft} />
      <SituationFields draft={draft} onChange={setDraft} />
      <ScheduleFields startMinutes={draft.startMinutes} targetMinutes={draft.targetMinutes} onChange={(v) => setDraft({ ...draft, ...v })} />
    </Screen>
  );
}
