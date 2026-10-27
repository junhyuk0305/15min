import { useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { clampTarget } from '@/components/goal/logic';
import { Button, Stepper } from '@/components/ui';
import { ValueRow } from '@/components/ValueRow';
import { copy } from '@/lib/copy';
import { TARGET_MAX, TARGET_MIN } from '@/lib/rules';
import { C, S, T } from '@/lib/theme';

const g = copy.goalSetup;

/** 하루 학습 분 고르기. 값 한 줄을 누르면 스테퍼 시트가 열린다(목표 정하기 2/3, 목표 관리) */
export function MinutesPicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <ValueRow label={g.minutes} value={copy.unit.minutes(value)} onPress={() => setOpen(true)} />
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <Stepper
          label={g.minutes}
          display={copy.unit.minutes(value)}
          onMinus={() => onChange(clampTarget(value - 1))}
          onPlus={() => onChange(clampTarget(value + 1))}
        />
        <Text style={[T.small, { color: C.sub, marginTop: -S.xs }]}>{g.minutesNote(TARGET_MIN, TARGET_MAX)}</Text>
        <Button title={copy.ux.close} onPress={() => setOpen(false)} />
      </BottomSheet>
    </View>
  );
}
