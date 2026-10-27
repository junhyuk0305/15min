import { Pressable, Text, View } from 'react-native';
import { MinutesPicker } from '@/components/MinutesPicker';
import { TimePicker } from '@/components/TimePicker';
import { Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { MIN_WEEKDAYS } from '@/lib/rules';
import { B, C, HIT, R, S, T } from '@/lib/theme';
import { Chip } from './Chip';
import { PERIOD_PRESETS, toggleWeekday, WEEKDAY_ORDER, type Plan } from './logic';

const g = copy.goalSetup;

function Note({ children }: { children: string }) {
  return <Text style={[T.small, { color: C.sub }]}>{children}</Text>;
}

/** 학습 요일 7칸. 칸을 붙여 한 줄에 둔다. 360dp에서도 칸마다 44 이상(목표 정하기 2/3, 목표 관리) */
export function WeekdayCells({ weekdays, onToggle }: { weekdays: readonly number[]; onToggle: (w: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: B.base, borderColor: C.ink, borderRadius: R.md, overflow: 'hidden' }}>
      {WEEKDAY_ORDER.map((w, i) => {
        const on = weekdays.includes(w);
        return (
          <Pressable
            key={w}
            accessibilityRole="checkbox"
            accessibilityLabel={g.weekdayNames[w]}
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(w)}
            style={{ flex: 1, minHeight: HIT, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ink : 'transparent', borderLeftWidth: i ? B.hair : 0, borderColor: C.line }}
          >
            <Text style={[T.buttonSm, { color: on ? C.onInk : C.ink }]}>{g.weekdayNames[w]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 숫자 항목은 채팅 대신 위젯으로 받는다(MP 3절). 기간 칩, 학습 요일, 약속 시각(1분 단위, TimePicker), 하루 학습 분(MinutesPicker) */
export function PlanFields({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const set = (patch: Partial<Plan>) => onChange({ ...plan, ...patch });
  return (
    <View style={{ gap: S.lg }}>
      <View style={{ gap: S.sm }}>
        <Label>{g.period}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
          {PERIOD_PRESETS.map((n) => (
            <Chip key={n} role="radio" label={copy.unit.days(n)} on={plan.periodDays === n} onPress={() => set({ periodDays: n })} />
          ))}
        </View>
        <Note>{g.periodNote}</Note>
      </View>

      <View style={{ gap: S.sm }}>
        <Label>{g.weekdays}</Label>
        <WeekdayCells weekdays={plan.weekdays} onToggle={(w) => set({ weekdays: toggleWeekday(plan.weekdays, w) })} />
        <Note>{g.weekdaysNote(MIN_WEEKDAYS)}</Note>
      </View>

      {/* 약속 시각과 하루 학습은 눌러서 바꾸는 값 한 줄이다. 칩, 요일 칸과 모양을 나눈다(디자인 고도화 C안) */}
      <View>
        <TimePicker value={plan.startMinutes} onChange={(startMinutes) => set({ startMinutes })} />
        <MinutesPicker value={plan.targetMinutes} onChange={(targetMinutes) => set({ targetMinutes })} />
      </View>
    </View>
  );
}
