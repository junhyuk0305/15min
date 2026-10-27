// 웹판 약속 시각 고르기. 시스템 선택기가 없어 값 한 줄을 누르면 시와 분 스테퍼, 15분 칩 시트가 열린다(메가프롬프트 3절 "시각 고르기").
// 값은 한국 시간 분 숫자(0~1439)다. 네이티브판은 TimePicker.tsx.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/goal/Chip';
import { MINUTE_PRESETS, setMinute, wrapDay } from '@/components/goal/logic';
import { Button, Stepper } from '@/components/ui';
import { ValueRow } from '@/components/ValueRow';
import { copy } from '@/lib/copy';
import { fmtClock } from '@/lib/rules';
import { showsKstLabel } from '@/lib/selectors';
import { C, S, T } from '@/lib/theme';

const g = copy.goalSetup;

export function TimePicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  const minute = value % 60;
  return (
    <View style={{ gap: S.xs }}>
      <ValueRow label={g.hour} value={fmtClock(value)} onPress={() => setOpen(true)} />
      {showsKstLabel(new Date().getTimezoneOffset()) ? <Text style={[T.small, { color: C.sub }]}>{copy.unit.kst}</Text> : null}
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
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
        <Button title={copy.ux.close} onPress={() => setOpen(false)} />
      </BottomSheet>
    </View>
  );
}
