import { View } from 'react-native';
import { copy } from '@/lib/copy';
import type { GoalInput } from '@/lib/model';
import { MIN_NOTE_CHARS, PERIOD_DEFAULT, TARGET_MAX, TARGET_MIN, fmtClock } from '@/lib/rules';
import { S } from '@/lib/theme';
import { Field, Stepper } from './ui';

// 목표 설정 채팅(goal-setup)이 생기기 전까지 쓰는 임시 입력. 상황 네 칸은 create_goal이 요구한다.
export type GoalDraft = {
  name: string;
  reason: string;
  startMinutes: number;
  targetMinutes: number;
  place: string;
  myRole: string;
  partner: string;
  task: string;
};

export const EMPTY_DRAFT: GoalDraft = { name: '', reason: '', startMinutes: 22 * 60, targetMinutes: 15, place: '', myRole: '', partner: '', task: '' };

// [가정] 요일 위젯이 생기기 전까지 7일 모두 학습 요일
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function draftToInput(d: GoalDraft): GoalInput {
  return {
    name: d.name,
    reason: d.reason,
    periodDays: PERIOD_DEFAULT,
    weekdays: ALL_WEEKDAYS,
    startMinutes: d.startMinutes,
    targetMinutes: d.targetMinutes,
    situation: { place: d.place, myRole: d.myRole, partner: d.partner, task: d.task },
    subsituations: [],
  };
}

export const goalPartValid = (d: GoalDraft) => d.name.trim().length > 0 && d.reason.trim().length >= MIN_NOTE_CHARS;
export const situationValid = (d: GoalDraft) => [d.place, d.myRole, d.partner, d.task].every((v) => v.trim().length > 0);

export function SituationFields({ draft, onChange }: { draft: GoalDraft; onChange: (d: GoalDraft) => void }) {
  const f = copy.goalForm;
  return (
    <View style={{ gap: S.md }}>
      <Field label={f.placeLabel} value={draft.place} onChange={(place) => onChange({ ...draft, place })} placeholder={f.placePlaceholder} />
      <Field label={f.myRoleLabel} value={draft.myRole} onChange={(myRole) => onChange({ ...draft, myRole })} placeholder={f.myRolePlaceholder} />
      <Field label={f.partnerLabel} value={draft.partner} onChange={(partner) => onChange({ ...draft, partner })} placeholder={f.partnerPlaceholder} />
      <Field label={f.taskLabel} value={draft.task} onChange={(task) => onChange({ ...draft, task })} placeholder={f.taskPlaceholder} />
    </View>
  );
}

const wrapDay = (m: number) => (m + 1440) % 1440;

export function GoalFields({ draft, onChange }: { draft: GoalDraft; onChange: (d: GoalDraft) => void }) {
  return (
    <View style={{ gap: S.md }}>
      <Field label={copy.goalForm.nameLabel} value={draft.name} onChange={(name) => onChange({ ...draft, name })} placeholder={copy.goalForm.namePlaceholder} />
      <Field
        label={copy.goalForm.reasonLabel}
        value={draft.reason}
        onChange={(reason) => onChange({ ...draft, reason })}
        placeholder={copy.goalForm.reasonPlaceholder}
        min={MIN_NOTE_CHARS}
        multiline
        note={copy.goalForm.reasonLocked}
      />
    </View>
  );
}

export function ScheduleFields({
  startMinutes,
  targetMinutes,
  onChange,
}: {
  startMinutes: number;
  targetMinutes: number;
  onChange: (v: { startMinutes: number; targetMinutes: number }) => void;
}) {
  return (
    <View style={{ gap: S.md }}>
      <Stepper
        label={copy.goalForm.hourLabel}
        display={fmtClock(startMinutes)}
        onMinus={() => onChange({ startMinutes: wrapDay(startMinutes - 60), targetMinutes })}
        onPlus={() => onChange({ startMinutes: wrapDay(startMinutes + 60), targetMinutes })}
      />
      <Stepper
        label={copy.goalForm.minuteLabel}
        display={fmtClock(startMinutes)}
        minusLabel="−5"
        plusLabel="+5"
        onMinus={() => onChange({ startMinutes: wrapDay(startMinutes - 5), targetMinutes })}
        onPlus={() => onChange({ startMinutes: wrapDay(startMinutes + 5), targetMinutes })}
      />
      <Stepper
        label={copy.goalForm.minutesLabel}
        display={copy.unit.minutes(targetMinutes)}
        onMinus={() => onChange({ startMinutes, targetMinutes: Math.max(TARGET_MIN, targetMinutes - 1) })}
        onPlus={() => onChange({ startMinutes, targetMinutes: Math.min(TARGET_MAX, targetMinutes + 1) })}
      />
    </View>
  );
}
