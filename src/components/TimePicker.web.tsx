// 웹판 시작 시각 고르기. 시스템 선택기가 없어 시와 분 스테퍼, 15분 칩을 둔다(메가프롬프트 3절 "시각 고르기").
// 값은 한국 시간 분 숫자(0~1439)다. 네이티브판은 TimePicker.tsx.
import { Text, View } from 'react-native';
import { Chip } from '@/components/goal/Chip';
import { MINUTE_PRESETS, setMinute, wrapDay } from '@/components/goal/logic';
import { Stepper } from '@/components/ui';
import { copy } from '@/lib/copy';
import { showsKstLabel } from '@/lib/selectors';
import { C, S, T } from '@/lib/theme';

const g = copy.goalSetup;

export function TimePicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const minute = value % 60;
  return (
    <View style={{ gap: S.sm }}>
      <Stepper
        label={g.hour}
        display={g.hourValue(Math.floor(value / 60))}
        onMinus={() => onChange(wrapDay(value - 60))}
        onPlus={() => onChange(wrapDay(value + 60))}
      />
      <Stepper
        label={g.minute}
        display={g.minuteValue(minute)}
        onMinus={() => onChange(setMinute(value, (minute + 59) % 60))}
        onPlus={() => onChange(setMinute(value, (minute + 1) % 60))}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
        {MINUTE_PRESETS.map((m) => (
          <Chip
            key={m}
            role="radio"
            label={`:${String(m).padStart(2, '0')}`}
            accessibilityLabel={`${g.minute} ${m}`}
            on={minute === m}
            onPress={() => onChange(setMinute(value, m))}
          />
        ))}
      </View>
      {showsKstLabel(new Date().getTimezoneOffset()) ? <Text style={[T.small, { color: C.sub }]}>{copy.unit.kst}</Text> : null}
    </View>
  );
}
