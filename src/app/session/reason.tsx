import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Header } from '@/components/Header';
import { LearnShell } from '@/components/learn/LearnShell';
import { Body, Button, Card, Field, H1, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { MAX_TODAY_REASON, phaseName, phasePlan } from '@/lib/learn';
import { LEARN_PATH } from '@/lib/route';
import { MIN_NOTE_CHARS, noteValid, settingsFor } from '@/lib/rules';
import { goalDaysOf, todayKey, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

const t = copy.session;

export default function Reason() {
  const state = useApp();
  const goal = state.goal;
  const today = todayKey(state);
  const [text, setText] = useState('');
  const start = useAction();
  // 오늘 이유를 이미 썼거나 끝난 날이면 route.ts가 학습 화면이나 홈으로 보낸다
  if (!goal) return null;

  // 가장 최근에 쓴 이유 (어제가 비었으면 그 전)
  const previous = goalDaysOf(state)
    .filter((d) => d.day < today && d.todayReason)
    .sort((a, b) => (a.day < b.day ? 1 : -1))[0]?.todayReason ?? undefined;
  const same = previous !== undefined && text.trim() === previous.trim();
  const n = text.trim().length;
  const short = MIN_NOTE_CHARS - n;
  // 빈 칸에는 이유를 띄우지 않는다. 쓰기 시작한 뒤 모자랄 때만 빨강으로 보인다(UXP 3절 빨강 안내)
  const disabledReason = n === 0 ? null : short > 0 ? t.needChars(short) : same ? t.sameAsYesterday : null;
  // 첫날(지난 이유 없음)에는 학습 순서와 단계별 시간을 보인다. 첫날 A는 수준 확인이다
  const plan = previous === undefined ? phasePlan(settingsFor(goal, today).targetMinutes) : null;

  const begin = async () => {
    const ok = await start.run(async () => {
      await state.startDay(text);
      return true;
    });
    if (ok) router.replace(LEARN_PATH);
  };

  return (
    <LearnShell
      theme="ivory"
      // 학습 전이라 강제 화면이 아니다. X는 홈으로(갭분석 N7)
      header={<Header title={t.reasonLabel} left="close" onLeft={() => !start.busy && router.replace('/')} />}
      footer={
        <>
          <ErrorLine message={start.message} />
          <Button
            title={t.begin}
            onPress={() => void begin()}
            busy={start.busy}
            disabled={!noteValid(text, previous)}
            disabledReason={disabledReason}
          />
        </>
      }
    >
      <H1>{t.reasonTitle}</H1>
      <Body muted>{t.reasonSub}</Body>
      <Card>
        <Label>{goal.name}</Label>
        <Body>{goal.reason}</Body>
      </Card>
      {previous ? (
        <View style={{ gap: S.xs }}>
          <Label>{t.yesterday}</Label>
          <Body muted>{previous}</Body>
        </View>
      ) : null}
      {plan ? (
        <View style={{ gap: S.xs }}>
          <Label>{t.planLabel}</Label>
          {plan.map((p, i) => (
            <Text key={p.phase} style={[T.small, { color: C.ink }]}>
              {t.planRow(i + 1, phaseName(p.phase, true), t.planTime(p.seconds))}
            </Text>
          ))}
        </View>
      ) : null}
      <Field
        value={text}
        onChange={(v) => setText(v.slice(0, MAX_TODAY_REASON))}
        placeholder={t.reasonPlaceholder}
        label={t.reasonLabel}
        min={MIN_NOTE_CHARS}
        multiline
        note={text.length >= MAX_TODAY_REASON ? t.maxChars(MAX_TODAY_REASON) : undefined}
      />
    </LearnShell>
  );
}
