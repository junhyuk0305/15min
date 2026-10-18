import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { LearnShell } from '@/components/learn/LearnShell';
import { Body, Button, Card, Field, H1, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { LEARN_PATH } from '@/lib/route';
import { MIN_NOTE_CHARS, noteValid } from '@/lib/rules';
import { goalDaysOf, todayKey, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { S } from '@/lib/theme';

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
      footer={
        <>
          <ErrorLine message={start.message} />
          <Button title={t.begin} onPress={() => void begin()} busy={start.busy} disabled={!noteValid(text, previous)} />
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
      <Field
        value={text}
        onChange={setText}
        placeholder={t.reasonPlaceholder}
        label={copy.goalForm.reasonLabel}
        min={MIN_NOTE_CHARS}
        multiline
        error={same ? t.sameAsYesterday : null}
      />
    </LearnShell>
  );
}
