import { Pressable, Text, View } from 'react-native';
import { Label, Stepper } from '@/components/ui';
import { copy } from '@/lib/copy';
import { MIN_WEEKDAYS, TARGET_MAX, TARGET_MIN } from '@/lib/rules';
import { showsKstLabel } from '@/lib/selectors';
import { B, C, HIT, R, S, T } from '@/lib/theme';
import { Chip } from './Chip';
import {
  clampPeriod,
  clampTarget,
  MINUTE_PRESETS,
  PERIOD_PRESETS,
  setMinute,
  toggleWeekday,
  WEEKDAY_ORDER,
  wrapDay,
  type Plan,
} from './logic';

const g = copy.goalSetup;

function Note({ children }: { children: string }) {
  return <Text style={[T.small, { color: C.sub }]}>{children}</Text>;
}

/** 숫자 항목은 채팅 대신 위젯으로 받는다(MP 3절). 기간, 학습 요일, 시작 시각(1분 단위), 하루 학습 분 */
export function PlanFields({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const set = (patch: Partial<Plan>) => onChange({ ...plan, ...patch });
  const minute = plan.startMinutes % 60;
  return (
    <View style={{ gap: S.lg }}>
      <View style={{ gap: S.sm }}>
        <Stepper
          label={g.period}
          display={copy.unit.days(plan.periodDays)}
          onMinus={() => set({ periodDays: clampPeriod(plan.periodDays - 1) })}
          onPlus={() => set({ periodDays: clampPeriod(plan.periodDays + 1) })}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {PERIOD_PRESETS.map((n) => (
            <Chip key={n} role="radio" label={copy.unit.days(n)} on={plan.periodDays === n} onPress={() => set({ periodDays: n })} />
          ))}
        </View>
        <Note>{g.periodNote}</Note>
      </View>

      <View style={{ gap: S.sm }}>
        <Label>{g.weekdays}</Label>
        {/* 7칸을 붙여 한 줄에 둔다. 360dp에서도 칸마다 44 이상 */}
        <View style={{ flexDirection: 'row', borderWidth: B.base, borderColor: C.ink, borderRadius: R.md, overflow: 'hidden' }}>
          {WEEKDAY_ORDER.map((w, i) => {
            const on = plan.weekdays.includes(w);
            return (
              <Pressable
                key={w}
                accessibilityRole="checkbox"
                accessibilityLabel={g.weekdayNames[w]}
                accessibilityState={{ checked: on }}
                onPress={() => set({ weekdays: toggleWeekday(plan.weekdays, w) })}
                style={{ flex: 1, minHeight: HIT, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ink : 'transparent', borderLeftWidth: i ? B.hair : 0, borderColor: C.line }}
              >
                <Text style={[T.buttonSm, { color: on ? C.onInk : C.ink }]}>{g.weekdayNames[w]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Note>{g.weekdaysNote(MIN_WEEKDAYS)}</Note>
      </View>

      <View style={{ gap: S.sm }}>
        <Stepper
          label={g.hour}
          display={g.hourValue(Math.floor(plan.startMinutes / 60))}
          onMinus={() => set({ startMinutes: wrapDay(plan.startMinutes - 60) })}
          onPlus={() => set({ startMinutes: wrapDay(plan.startMinutes + 60) })}
        />
        <Stepper
          label={g.minute}
          display={g.minuteValue(minute)}
          onMinus={() => set({ startMinutes: setMinute(plan.startMinutes, (minute + 59) % 60) })}
          onPlus={() => set({ startMinutes: setMinute(plan.startMinutes, (minute + 1) % 60) })}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {MINUTE_PRESETS.map((m) => (
            <Chip
              key={m}
              role="radio"
              label={`:${String(m).padStart(2, '0')}`}
              accessibilityLabel={`${g.minute} ${m}`}
              on={minute === m}
              onPress={() => set({ startMinutes: setMinute(plan.startMinutes, m) })}
            />
          ))}
        </View>
        {showsKstLabel(new Date().getTimezoneOffset()) ? <Note>{copy.unit.kst}</Note> : null}
      </View>

      <View style={{ gap: S.sm }}>
        <Stepper
          label={g.minutes}
          display={copy.unit.minutes(plan.targetMinutes)}
          onMinus={() => set({ targetMinutes: clampTarget(plan.targetMinutes - 1) })}
          onPlus={() => set({ targetMinutes: clampTarget(plan.targetMinutes + 1) })}
        />
        <Note>{g.minutesNote(TARGET_MIN, TARGET_MAX)}</Note>
      </View>
    </View>
  );
}
