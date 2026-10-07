import { Pressable, ScrollView, Text, View } from 'react-native';
import { copy } from '@/lib/copy';
import { MAX_TARGET, MIN_NOTE_CHARS, MIN_TARGET, fmtClock } from '@/lib/rules';
import { allBots, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';
import { Field, Label, Stepper } from './ui';

export type GoalDraft = { name: string; reason: string; startMinutes: number; targetMinutes: number; botId: string };

export const EMPTY_DRAFT: GoalDraft = { name: '', reason: '', startMinutes: 22 * 60, targetMinutes: 15, botId: 'email' };

export const goalPartValid = (d: GoalDraft) => d.name.trim().length > 0 && d.reason.trim().length >= MIN_NOTE_CHARS;

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
        display={`${targetMinutes}분`}
        onMinus={() => onChange({ startMinutes, targetMinutes: Math.max(MIN_TARGET, targetMinutes - 1) })}
        onPlus={() => onChange({ startMinutes, targetMinutes: Math.min(MAX_TARGET, targetMinutes + 1) })}
      />
    </View>
  );
}

export function BotPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const custom = useApp((s) => s.customBots);
  return (
    <View style={{ gap: S.xs }}>
      <Label>{copy.goalForm.botLabel}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {allBots(custom).map((b) => {
          const on = b.id === value;
          return (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(b.id)}
              style={{
                paddingHorizontal: S.md,
                minHeight: 48,
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 2,
                borderColor: C.ink,
                backgroundColor: on ? C.ink : 'transparent',
              }}
            >
              <Text style={[T.small, { color: on ? C.card : C.ink }]}>{b.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
