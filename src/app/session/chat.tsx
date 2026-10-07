import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Gauge, H1 } from '@/components/ui';
import { AI_IS_STUB, reply } from '@/lib/ai';
import { copy } from '@/lib/copy';
import { clearAll } from '@/lib/notify';
import { dayKeyOf, fmtDuration, IDLE_MS } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { activeGoalOf, findBot, keyOf, nowMs, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.session;
const SAVE_EVERY = 5;

export default function Chat() {
  const insets = useSafeAreaInsets();
  const state = useApp();
  const goal = activeGoalOf(state);
  const rec = goal ? state.records[keyOf(goal.id, dayKeyOf(nowMs()))] : undefined;
  const bot = findBot(state.customBots, rec?.botId ?? goal?.botId ?? '');
  const setInSession = useRuntime((s) => s.setInSession);

  const [secs, setSecs] = useState(rec?.activeSeconds ?? 0);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [idle, setIdle] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  const lastInput = useRef(nowMs());
  const secsRef = useRef(secs);
  const scroll = useRef<ScrollView>(null);

  const target = (rec?.targetMinutes ?? 0) * 60;
  const remaining = Math.max(0, target - secs);
  const filled = target > 0 && remaining === 0;
  const valid = rec?.status === 'progress' && !!rec.reason;

  useEffect(() => {
    if (!valid) router.replace('/');
  }, [valid]);

  const save = useCallback(() => useApp.getState().setActiveSeconds(secsRef.current), []);
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
      const r = useApp.getState();
      const g = activeGoalOf(r);
      const cur = g ? r.records[keyOf(g.id, dayKeyOf(nowMs()))] : undefined;
      if (cur?.status === 'progress') r.setLeftAt(nowMs());
      setInSession(false);
    };
  }, [save, setInSession]);

  // 첫 메시지
  useEffect(() => {
    if (valid && rec && rec.messages.length === 0) {
      useApp.getState().addMessage({ role: 'bot', text: bot.opening, at: nowMs() });
    }
  }, [valid, rec, bot.opening]);

  // 1초 시계: 화면이 켜져 있고, 코치가 쓰는 중이 아니고, 딴짓 팝업이 없을 때만 줄어든다
  useEffect(() => {
    const id = setInterval(() => {
      if (!active || filled) return;
      if (!idle && nowMs() - lastInput.current > IDLE_MS) {
        setIdle(true);
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      if (typing || idle) return;
      const n = Math.min(target, secsRef.current + 1);
      secsRef.current = n;
      setSecs(n);
      if (n % SAVE_EVERY === 0 || n === target) save();
    }, 1000);
    return () => clearInterval(id);
  }, [active, typing, idle, filled, target, save]);

  const send = async () => {
    const body = text.trim();
    if (body.length < bot.minChars || typing || !rec) return;
    touch();
    setText('');
    const store = useApp.getState();
    store.addMessage({ role: 'user', text: body, at: nowMs() }, body.length);
    setTyping(true);
    try {
      const history = activeGoalOf(useApp.getState()) ? useApp.getState().records[keyOf(rec.goalId, rec.day)]?.messages ?? [] : [];
      const answer = await reply(bot, history);
      useApp.getState().addMessage({ role: 'bot', text: answer, at: nowMs() });
    } catch {
      useApp.getState().addMessage({ role: 'bot', text: copy.error.generic, at: nowMs() });
    } finally {
      setTyping(false);
      touch();
    }
  };

  if (!valid || !rec) return null;
  const n = text.trim().length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      onTouchStart={touch}
    >
      <View style={{ paddingTop: insets.top + S.sm, paddingHorizontal: S.lg, paddingBottom: S.sm, gap: S.xs, borderBottomWidth: 2, borderColor: C.ink }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={[T.label, { color: C.sub }]}>{typing || idle || !active ? `${t.left}  ${t.paused}` : t.left}</Text>
            <Text style={T.big}>{fmtDuration(remaining * 1000)}</Text>
          </View>
          <Text style={[T.small, { color: C.sub }]}>{bot.name}</Text>
        </View>
        <Gauge ratio={target ? secs / target : 0} />
        {AI_IS_STUB ? <Text style={[T.small, { color: C.sub }]}>{t.stubNote}</Text> : null}
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.lg, gap: S.sm }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {rec.messages.map((m, i) => (
          <View
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              backgroundColor: m.role === 'user' ? C.ink : C.card,
              borderRadius: 14,
              padding: S.md,
              borderWidth: m.role === 'user' ? 0 : 1,
              borderColor: C.line,
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
            <Button title={t.toReview} onPress={() => router.replace('/session/review')} />
          </>
        ) : (
          <>
            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                touch();
              }}
              placeholder={t.inputPlaceholder}
              placeholderTextColor={C.disabled}
              multiline
              style={{ minHeight: 88, maxHeight: 160, borderWidth: 2, borderColor: C.ink, borderRadius: 12, padding: S.md, fontSize: 16, color: C.ink, backgroundColor: C.card, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              <View style={{ flex: 1, gap: S.xs }}>
                <Gauge ratio={n / bot.minChars} />
                <Text style={[T.small, { color: n >= bot.minChars ? C.ink : C.red }]}>{t.charCount(n, bot.minChars)}</Text>
              </View>
              <Button title={t.send} onPress={send} disabled={n < bot.minChars || typing} style={{ minWidth: 120 }} />
            </View>
          </>
        )}
      </View>

      <Modal transparent visible={idle} animationType="fade" onRequestClose={() => setIdle(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: S.lg }}>
          <View style={{ width: '100%', maxWidth: 412, backgroundColor: C.red, borderRadius: 16, padding: S.lg, gap: S.md }}>
            <H1 inverse>{t.idleTitle}</H1>
            <Body inverse>{t.idleBody}</Body>
            <Pressable onPress={() => { touch(); setIdle(false); }}>
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
