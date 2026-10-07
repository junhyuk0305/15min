import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, Field, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { addDays, dayKeyOf, MIN_NOTE_CHARS, noteValid } from '@/lib/rules';
import { activeGoalOf, keyOf, nowMs, useApp } from '@/lib/store';
import { S } from '@/lib/theme';

const t = copy.session;

export default function Reason() {
  const state = useApp();
  const goal = activeGoalOf(state);
  const today = dayKeyOf(nowMs());
  const rec = goal ? state.records[keyOf(goal.id, today)] : undefined;
  const [text, setText] = useState('');

  // 오늘 이유를 이미 썼으면 채팅으로, 이미 끝난 날이면 홈으로
  useEffect(() => {
    if (!goal || goal.giveupSince !== null || (rec && rec.status !== 'progress')) router.replace('/');
    else if (rec?.reason) router.replace('/session/chat');
  }, [goal, rec]);

  if (!goal) return null;

  // 가장 최근에 쓴 이유 (어제가 비었으면 그 전)
  let previous: string | undefined;
  for (let d = addDays(today, -1), i = 0; i < 60; d = addDays(d, -1), i++) {
    const r = state.records[keyOf(goal.id, d)];
    if (r?.reason) {
      previous = r.reason;
      break;
    }
  }
  const same = previous !== undefined && text.trim() === previous.trim();

  const begin = () => {
    state.startDay(text);
    router.replace('/session/chat');
  };

  return (
    <Screen footer={<Button title={t.begin} onPress={begin} disabled={!noteValid(text, previous)} />}>
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
    </Screen>
  );
}
