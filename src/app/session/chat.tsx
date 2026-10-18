import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorLine } from '@/components/ErrorLine';
import { Body, Button, Gauge, H1 } from '@/components/ui';
import { copy } from '@/lib/copy';
import { clearAll } from '@/lib/notify';
import { reportError } from '@/lib/report';
import { RETRO_PATH } from '@/lib/route';
import { canSend, fmtDuration, isIdle, phaseAt } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { messagesOf, nowMs, todayRow, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

// 학습 화면(임시). 상황 대화를 lesson-turn 함수로 한다. 학습 화면 작업에서 A/B/C 한 화면으로 바뀐다.
// 센 시간은 서버에 save_progress로 남기고, 서버가 경과 시간으로 다시 자른다.

const t = copy.session;
const SAVE_EVERY = 5;

export default function Chat() {
  const insets = useSafeAreaInsets();
  const state = useApp();
  const goal = state.goal;
  const rec = todayRow(state);
  const messages = goal && rec ? messagesOf(state, goal.id, rec.day) : [];
  const setInSession = useRuntime((s) => s.setInSession);
  const turn = useAction();
  const retro = useAction();

  const [secs, setSecs] = useState(rec?.activeSeconds ?? 0);
  const [text, setText] = useState('');
  const [idle, setIdle] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  const lastInput = useRef(nowMs());
  const secsRef = useRef(secs);
  const scroll = useRef<ScrollView>(null);
  const started = useRef(false);

  const targetMinutes = rec?.targetMinutes ?? 0;
  const target = targetMinutes * 60;
  const remaining = Math.max(0, target - secs);
  const filled = target > 0 && remaining === 0;
  const typing = turn.busy;

  const save = useCallback(() => {
    if (secsRef.current <= 0 || targetMinutes <= 0) return;
    useApp
      .getState()
      .saveProgress(secsRef.current, phaseAt(secsRef.current, targetMinutes))
      .catch((e: unknown) => reportError(e, 'save_progress'));
  }, [targetMinutes]);
  const touch = () => {
    lastInput.current = nowMs();
  };

  // 학습 중에는 예약 알림을 내린다. 나가면 남은 시간 기준으로 다시 건다.
  useEffect(() => {
    setInSession(true);
    void clearAll();
    useApp.getState().setLeftAt(null);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        setActive(true);
        touch();
        useApp.getState().setLeftAt(null);
        setInSession(true);
        void clearAll();
      } else {
        setActive(false);
        save();
        useApp.getState().setLeftAt(nowMs());
        setInSession(false);
      }
    });
    return () => {
      sub.remove();
      save();
      if (todayRow()?.status === 'progress') useApp.getState().setLeftAt(nowMs());
      setInSession(false);
    };
  }, [save, setInSession]);

  // 첫 질문: 오늘 메시지가 없으면 서버가 되짚기와 첫 질문을 만든다
  useEffect(() => {
    if (started.current || !rec || messages.length > 0) return;
    started.current = true;
    void turn.run(() => useApp.getState().lessonTurn());
  }, [rec, messages.length, turn]);

  // 1초 시계: 화면이 켜져 있고, 응답을 기다리는 중이 아니고, 딴짓 팝업이 없고, 실패 안내가 없을 때만 센다
  useEffect(() => {
    const id = setInterval(() => {
      if (!active || filled) return;
      if (!idle && isIdle(lastInput.current, nowMs())) {
        setIdle(true);
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      if (typing || idle || turn.error) return;
      const n = Math.min(target, secsRef.current + 1);
      secsRef.current = n;
      setSecs(n);
      if (n % SAVE_EVERY === 0 || n === target) save();
    }, 1000);
    return () => clearInterval(id);
  }, [active, typing, idle, filled, target, save, turn.error]);

  const send = async () => {
    const body = text.trim();
    if (!canSend(body) || typing || !rec) return;
    touch();
    setText('');
    const ok = await turn.run(async () => {
      await useApp.getState().lessonTurn(body);
      return true;
    });
    if (!ok) setText(body); // 입력한 문장은 남긴다 (MP 7.3)
    touch();
  };

  const toRetro = async () => {
    save();
    const ok = await retro.run(async () => {
      await useApp.getState().startRetro();
      return true;
    });
    if (ok) router.replace(RETRO_PATH);
  };

  if (!goal || !rec) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} onTouchStart={touch}>
      <View style={{ paddingTop: insets.top + S.sm, paddingHorizontal: S.lg, paddingBottom: S.sm, gap: S.xs, borderBottomWidth: 2, borderColor: C.ink }}>
        <Text style={[T.label, { color: C.sub }]}>{typing || idle || !active ? `${t.left}  ${t.paused}` : t.left}</Text>
        <Text style={T.big}>{fmtDuration(remaining * 1000)}</Text>
        <Gauge ratio={target ? secs / target : 0} />
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.lg, gap: S.sm }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              backgroundColor: m.role === 'user' ? C.ink : C.card,
              borderRadius: 14,
              padding: S.md,
              borderWidth: m.role === 'user' ? 0 : 1,
              borderColor: C.line,
              opacity: m.pending ? 0.6 : 1,
            }}
          >
            <Text style={[T.body, { color: m.role === 'user' ? C.card : C.ink }]}>{m.text}</Text>
          </View>
        ))}
        {typing ? <Body muted>{t.typing}</Body> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: insets.bottom + S.md, gap: S.sm, borderTopWidth: 1, borderColor: C.line }}>
        {filled ? (
          <>
            <Text style={T.h2}>{t.filled}</Text>
            <ErrorLine message={retro.message} />
            <Button title={t.toReview} busy={retro.busy} onPress={() => void toRetro()} />
          </>
        ) : (
          <>
            <ErrorLine message={turn.message} />
            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                touch();
              }}
              placeholder={t.inputPlaceholder}
              placeholderTextColor={C.disabled}
              accessibilityLabel={t.inputPlaceholder}
              multiline
              style={{ minHeight: 88, maxHeight: 160, borderWidth: 2, borderColor: C.ink, borderRadius: 12, padding: S.md, fontSize: 16, color: C.ink, backgroundColor: C.card, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Button title={t.send} onPress={() => void send()} busy={typing} disabled={!canSend(text)} style={{ minWidth: 120 }} />
            </View>
          </>
        )}
      </View>

      <Modal transparent visible={idle} animationType="fade" onRequestClose={() => setIdle(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: S.lg }}>
          <View style={{ width: '100%', maxWidth: 412, backgroundColor: C.red, borderRadius: 16, padding: S.lg, gap: S.md }}>
            <H1 inverse>{t.idleTitle}</H1>
            <Body inverse>{t.idleBody}</Body>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                touch();
                setIdle(false);
              }}
            >
              <View style={{ minHeight: 56, borderRadius: 14, backgroundColor: C.redInk, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[T.h2, { color: C.red }]}>{t.idleContinue}</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
