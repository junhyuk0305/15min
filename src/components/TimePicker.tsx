// 시작 시각 고르기(메가프롬프트 3절 "시각 고르기", 갭분석 7.3). iOS와 Android는 시스템 시각 선택기, 웹은 TimePicker.web.tsx의 스테퍼.
// 값은 한국 시간 분 숫자(0~1439)다. 선택기에 timeZoneName을 넘겨 기기 시간대와 상관없이 한국 시각으로 보이고 받는다.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Glyph } from '@/components/Glyph';
import { Button, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { tap } from '@/lib/haptics';
import { APP_TIME_ZONE, fmtClock } from '@/lib/rules';
import { showsKstLabel } from '@/lib/selectors';
import { minutesToPickerDate, pickerDateToMinutes } from '@/lib/timePick';
import { B, C, HIT, R, S, T } from '@/lib/theme';

const g = copy.goalSetup;

export function TimePicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  const clock = fmtClock(value);

  const show = () => {
    tap();
    if (Platform.OS === 'android') {
      // Android는 명령형 대화상자를 권장한다(패키지 README "Android imperative api")
      DateTimePickerAndroid.open({
        value: minutesToPickerDate(value),
        mode: 'time',
        is24Hour: true,
        timeZoneName: APP_TIME_ZONE,
        onValueChange: (_e, d) => onChange(pickerDateToMinutes(d)),
      });
      return;
    }
    setOpen(true);
  };

  return (
    <View style={{ gap: S.xs }}>
      <Label>{g.hour}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${g.hour} ${clock}`}
        onPress={show}
        style={({ pressed }) => ({
          minHeight: HIT + 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: S.md,
          borderWidth: B.base,
          borderColor: C.ink,
          borderRadius: R.md,
          backgroundColor: pressed ? C.line : C.card,
        })}
      >
        <Text style={[T.big, { fontSize: 28, lineHeight: 36, color: C.ink }]}>{clock}</Text>
        <Glyph name="forward" size={16} color={C.sub} />
      </Pressable>
      {showsKstLabel(new Date().getTimezoneOffset()) ? <Text style={[T.small, { color: C.sub }]}>{copy.unit.kst}</Text> : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet visible={open} onClose={() => setOpen(false)}>
          <Text accessibilityRole="header" style={[T.h2, { color: C.ink }]}>
            {g.hour}
          </Text>
          {/* iOS 휠. 돌리는 대로 값이 바뀌고 저장은 화면의 저장 버튼이 한다 */}
          <DateTimePicker
            value={minutesToPickerDate(value)}
            mode="time"
            display="spinner"
            timeZoneName={APP_TIME_ZONE}
            themeVariant="light"
            onValueChange={(_e, d) => onChange(pickerDateToMinutes(d))}
            style={{ alignSelf: 'center' }}
          />
          <Button title={copy.ux.close} onPress={() => setOpen(false)} />
        </BottomSheet>
      ) : null}
    </View>
  );
}
