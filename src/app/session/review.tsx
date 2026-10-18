import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Body, Button, Field, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { clearAll } from '@/lib/notify';
import { useRuntime } from '@/lib/runtime';
import { dayKeyOf, MIN_NOTE_CHARS, noteValid } from '@/lib/rules';
import { activeGoalOf, deviceTz, keyOf, nowMs, useApp } from '@/lib/store';

const t = copy.session;

export default function Review() {
  const state = useApp();
  const goal = activeGoalOf(state);
  const rec = goal ? state.records[keyOf(goal.id, dayKeyOf(nowMs(), deviceTz))] : undefined;
  const [text, setText] = useState('');
  const filled = !!rec && rec.status === 'progress' && rec.activeSeconds >= rec.targetMinutes * 60;

  const setInSession = useRuntime((s) => s.setInSession);
  const finishing = useRef(false);

  useEffect(() => {
    if (!filled && !finishing.current) router.replace('/');
  }, [filled]);

  // 소감을 쓰는 동안은 독촉하지 않는다
  useEffect(() => {
    setInSession(true);
    void clearAll();
    return () => setInSession(false);
  }, [setInSession]);

  if (!filled || !rec) return null;

  const finish = () => {
    finishing.current = true;
    const earned = state.finishDay(text);
    router.replace({ pathname: '/session/done', params: { earned: earned ? '1' : '0' } });
  };

  return (
    <Screen footer={<Button title={t.finish} onPress={finish} disabled={!noteValid(text)} />}>
      <H1>{t.reviewTitle}</H1>
      <Body muted>{t.reviewSub}</Body>
      <Label>{copy.archive.chars(rec.chars)}</Label>
      <Field value={text} onChange={setText} placeholder={t.reviewPlaceholder} label={copy.archive.review} min={MIN_NOTE_CHARS} multiline />
    </Screen>
  );
}
