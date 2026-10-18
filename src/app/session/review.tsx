import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, TextInput, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Body, Button, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { clearAll } from '@/lib/notify';
import { reportError } from '@/lib/report';
import { canSend, fmtDuration, RETRO_SECONDS } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { messagesOf, todayRow, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

// 회고 3분(임시). retro 함수와 영어로 대화한다. 학습 화면 작업에서 /session/retro로 바뀐다.

const t = copy.session;
const SAVE_EVERY = 5;

export default function Review() {
  const state = useApp();
  const goal = state.goal;
  const rec = todayRow(state);
  const messages = goal && rec ? messagesOf(state, goal.id, rec.day).filter((m) => m.phase === 'retro') : [];
  const setInSession = useRuntime((s) => s.setInSession);
  const turn = useAction();
  const finish = useAction();
  const [text, setText] = useState('');
  const [secs, setSecs] = useState(rec?.retroSeconds ?? 0);
  const [active, setActive] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  const secsRef = useRef(secs);
  const asked = useRef(false);
  const done = rec?.status === 'done';
  const filled = secs >= RETRO_SECONDS;

  // 회고 중에는 독촉하지 않는다
  useEffect(() => {
    setInSession(true);
    void clearAll();
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => {
      sub.remove();
      setInSession(false);
    };
  }, [setInSession]);

  // 고정 질문 1
  useEffect(() => {
    if (asked.current || !rec || done || messages.length > 0) return;
    asked.current = true;
    void turn.run(() => useApp.getState().retroTurn());
  }, [rec, done, messages.length, turn]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!active || filled || done) return;
      const n = Math.min(RETRO_SECONDS, secsRef.current + 1);
      secsRef.current = n;
      setSecs(n);
      if (n % SAVE_EVERY === 0 || n === RETRO_SECONDS) {
        useApp.getState().saveRetroProgress(n).catch((e: unknown) => reportError(e, 'save_retro'));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, filled, done]);

  if (!goal || !rec) return null;

  const send = async () => {
    const body = text.trim();
    if (!canSend(body) || turn.busy) return;
    setText('');
    const ok = await turn.run(async () => {
      await useApp.getState().retroTurn(body);
      return true;
    });
    if (!ok) setText(body);
  };

  const complete = async () => {
    const earned = await finish.run(() => useApp.getState().completeDay());
    if (earned !== undefined) router.replace({ pathname: '/session/done', params: { earned: earned ? '1' : '0' } });
  };

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={turn.message ?? finish.message} />
          {filled || done ? (
            <Button title={t.finish} busy={finish.busy} onPress={() => void complete()} />
          ) : (
            <>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t.reviewPlaceholder}
                placeholderTextColor={C.disabled}
                accessibilityLabel={t.reviewPlaceholder}
                multiline
                style={{ minHeight: 80, maxHeight: 160, borderWidth: 2, borderColor: C.ink, borderRadius: 12, padding: S.md, fontSize: 16, color: C.ink, backgroundColor: C.card, textAlignVertical: 'top' }}
              />
              <Button title={t.send} busy={turn.busy} disabled={!canSend(text)} onPress={() => void send()} />
            </>
          )}
        </>
      }
    >
      <H1>{t.reviewTitle}</H1>
      <Body muted>{t.reviewSub}</Body>
      <Text style={[T.label, { color: C.sub }]}>{fmtDuration(Math.max(0, RETRO_SECONDS - secs) * 1000)}</Text>
      <View style={{ gap: S.sm }}>
        {messages.map((m) => (
          <Text key={m.id} style={[T.body, { color: m.role === 'user' ? C.ink : C.sub, textAlign: m.role === 'user' ? 'right' : 'left', opacity: m.pending ? 0.6 : 1 }]}>
            {m.text}
          </Text>
        ))}
      </View>
    </Screen>
  );
}
