import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, Text, TextInput, View } from 'react-native';
import { ChatLine } from '@/components/ChatLine';
import { ErrorLine } from '@/components/ErrorLine';
import { Chip } from '@/components/goal/Chip';
import { useGoalDraft } from '@/components/goal/draft';
import { Frame } from '@/components/goal/Frame';
import { SetupHeader } from '@/components/goal/Header';
import {
  canAsk,
  choicesOf,
  FIELD_MAX,
  FIELD_ORDER,
  firstStart,
  missingFields,
  toGoalInput,
  WEEKDAY_ORDER,
  weekdaysShort,
  type FieldKey,
} from '@/components/goal/logic';
import { PlanFields } from '@/components/goal/PlanFields';
import { useSetupReport } from '@/components/goal/ReportSheet';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Field, Row, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { APP_TIME_ZONE, crossesBoundary, fmtClock, MIN_NOTE_CHARS } from '@/lib/rules';
import { useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { B, C, HIT, R, S, T } from '@/lib/theme';

// 목표 설정 (MP 3절, 결정안 1, 8). 첫 목표와 달성 뒤 새 목표가 모두 이 화면이다. 닫기 없음, 뒤로 가기 막음.
// 1/3 채팅(goal-setup): 이유 → 장소 → 내 역할 → 상대 → 해결할 일 → 목표 이름.
// 2/3 위젯: 기간, 학습 요일, 시작 시각, 하루 학습 분. 3/3 확인 카드 → create_goal → 홈.
// 만들면 route.ts가 /goal/new를 홈으로 보낸다.

const g = copy.goalSetup;

function useDraftHydrated() {
  const [done, setDone] = useState(useGoalDraft.persist.hasHydrated());
  useEffect(() => useGoalDraft.persist.onFinishHydration(() => setDone(true)), []);
  return done;
}

export default function NewGoal() {
  const hydrated = useDraftHydrated();
  const userId = useApp((s) => s.userId);
  const stage = useGoalDraft((s) => s.stage);
  const manual = useGoalDraft((s) => s.manual);
  const ready = useGoalDraft((s) => s.lines.length > 0 && s.userId === userId);

  useEffect(() => {
    if (hydrated) useGoalDraft.getState().begin(userId, useApp.getState().lastGoal);
  }, [hydrated, userId]);

  // Android 뒤로 가기: 확인 → 약속 → 채팅. 채팅에서는 막는다(강제 화면, MP 7.7-2)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const s = useGoalDraft.getState();
        if (s.stage === 'confirm') s.setStage('plan');
        else if (s.stage === 'plan') s.setStage('chat');
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const screen = <Stack.Screen options={{ gestureEnabled: false }} />;
  if (!hydrated || !ready) {
    return (
      <>
        {screen}
        <Frame footer={null}>
          <ActivityIndicator color={C.ink} style={{ marginTop: S.xxl }} />
        </Frame>
      </>
    );
  }
  return (
    <>
      {screen}
      {stage === 'plan' ? <PlanStage /> : stage === 'confirm' ? <ConfirmStage /> : manual ? <ManualStage /> : <ChatStage />}
    </>
  );
}

// ---------- 1/3 채팅 ----------

function ChatStage() {
  const lines = useGoalDraft((s) => s.lines);
  const fields = useGoalDraft((s) => s.fields);
  const done = useGoalDraft((s) => s.done);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useSetupReport();

  const send = async (raw: string) => {
    const body = raw.trim();
    if (!body || busy) return;
    const d = useGoalDraft.getState();
    if (!canAsk(d.lines)) {
      toManual(body);
      return;
    }
    setBusy(true);
    setError(null);
    setText('');
    try {
      await d.send(body);
    } catch (e) {
      const err = toApiError(e);
      if (err.kind === 'limit') toManual(body);
      else {
        setText(body); // 입력한 문장은 남긴다 (MP 7.3)
        setError(errorText(err.kind, err.code));
      }
    } finally {
      setBusy(false);
    }
  };

  // 대화 횟수를 다 쓰면 남은 항목을 직접 쓴다. 지금 쓴 답은 지금 묻던 항목에 넣어 둔다
  const toManual = (body: string) => {
    const d = useGoalDraft.getState();
    const next = missingFields(d.fields)[0];
    if (next) d.setField(next, body);
    d.setManual();
  };

  const last = lines[lines.length - 1];
  const chips = !busy && last?.role === 'coach' ? choicesOf(last.text) : [];
  if (!busy && last?.role === 'coach' && fields.goal_name && !done) chips.push(g.acceptName);
  const askingReason = missingFields(fields).includes('reason');
  const n = text.trim().length;
  // 이유를 묻는 동안은 20자부터 보낸다. 비활성 이유는 입력창 바로 위에 둔다(MP 7.5-5)
  const short = askingReason ? Math.max(0, MIN_NOTE_CHARS - n) : 0;
  const off = busy || !n || short > 0;
  const hint = busy ? null : short > 0 ? g.needChars(short) : !n ? g.needText : null;

  const speakerOf = (role: 'user' | 'coach'): 'me' | 'partner' => (role === 'user' ? 'me' : 'partner');

  return (
    <Frame
      stick
      header={<SetupHeader stage="chat" fields={fields} />}
      footer={
        <>
          {chips.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {chips.map((c) => (
                <Chip key={c} label={c} onPress={() => void send(c)} />
              ))}
            </View>
          ) : null}
          {error ? (
            <View style={{ gap: S.xs }}>
              <ErrorLine message={error} />
              <TextButton title={g.retry} onPress={() => void send(text)} disabled={off} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}
          {hint ? <Text style={[T.small, { color: C.sub }]}>{hint}</Text> : null}
          <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'stretch' }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={g.placeholder}
              placeholderTextColor={C.sub}
              accessibilityLabel={g.placeholder}
              maxLength={FIELD_MAX.reason}
              multiline
              editable={!busy}
              style={[
                T.body,
                { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 140, borderWidth: B.base, borderColor: C.ink, borderRadius: R.md, backgroundColor: C.card, color: C.ink, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g.send}
              accessibilityState={{ disabled: off, busy }}
              disabled={off}
              onPress={() => void send(text)}
              style={({ pressed }) => ({
                minWidth: 64,
                minHeight: HIT,
                borderRadius: R.md,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: S.sm,
                backgroundColor: off ? C.disabled : C.ink,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {busy ? <ActivityIndicator size="small" color={C.onInk} /> : <Text style={[T.buttonSm, { color: C.onInk }]}>{g.send}</Text>}
            </Pressable>
          </View>
          {done ? <TextButton title={g.toPlan} onPress={() => useGoalDraft.getState().setStage('plan')} /> : null}
        </>
      }
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {lines.map((l, i) => (
          <View key={l.id}>
            <ChatLine speaker={speakerOf(l.role)} text={l.text} who={l.role === 'user' ? g.me : g.coach} prev={i > 0 ? speakerOf(lines[i - 1].role) : null} />
            {/* 첫 줄은 앱이 쓴 고정 질문이다. 그 뒤 코치 답만 신고할 수 있다 */}
            {l.role === 'coach' && i > 0 ? (
              <TextButton
                title={copy.report.action}
                tone="sub"
                accessibilityLabel={copy.report.label}
                onPress={() => report.open(l.text)}
                style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
              />
            ) : null}
          </View>
        ))}
        {busy ? <ChatLine speaker="narration" text={g.typing} prev="me" /> : null}
      </View>
      {report.sheet}
    </Frame>
  );
}

// ---------- 1/3 직접 쓰기 (대화 횟수를 다 썼을 때) ----------

const PLACEHOLDER: Record<FieldKey, string> = {
  reason: copy.goalForm.reasonPlaceholder,
  place: copy.goalForm.placePlaceholder,
  my_role: copy.goalForm.myRolePlaceholder,
  partner: copy.goalForm.partnerPlaceholder,
  task: copy.goalForm.taskPlaceholder,
  goal_name: copy.goalForm.namePlaceholder,
};

function ManualStage() {
  const fields = useGoalDraft((s) => s.fields);
  const setField = useGoalDraft((s) => s.setField);
  const left = missingFields(fields).length;
  return (
    <Frame
      header={<SetupHeader stage="chat" fields={fields} />}
      footer={
        <Button
          title={g.toPlan}
          disabled={left > 0}
          disabledReason={left > 0 ? g.needFields(left) : null}
          onPress={() => useGoalDraft.getState().setStage('plan')}
        />
      }
    >
      <Body>{g.manualNote}</Body>
      {FIELD_ORDER.map((k) => (
        <Field
          key={k}
          label={g.fields[k]}
          value={fields[k] ?? ''}
          onChange={(v) => setField(k, v)}
          placeholder={PLACEHOLDER[k]}
          maxLength={FIELD_MAX[k]}
          multiline={k === 'reason'}
          min={k === 'reason' ? MIN_NOTE_CHARS : undefined}
          note={k === 'reason' ? copy.goalForm.reasonLocked : k === 'goal_name' ? g.nameNote : undefined}
          serif={k === 'reason'}
        />
      ))}
    </Frame>
  );
}

// ---------- 2/3 학습 약속 ----------

function PlanStage() {
  const fields = useGoalDraft((s) => s.fields);
  const plan = useGoalDraft((s) => s.plan);
  const setPlan = useGoalDraft((s) => s.setPlan);
  const short = weekdaysShort(plan.weekdays);
  // 학습과 회고가 04:00을 넘는 일정은 서버가 받지 않는다(crosses_boundary)
  const reason = short > 0 ? g.weekdaysLeft(short) : crossesBoundary(plan.startMinutes, plan.targetMinutes) ? g.boundary : null;
  return (
    <Frame
      header={<SetupHeader stage="plan" fields={fields} />}
      footer={
        <>
          <Button
            title={g.toConfirm}
            disabled={!!reason}
            disabledReason={reason}
            onPress={() => useGoalDraft.getState().setStage('confirm')}
          />
          <TextButton title={g.toChat} tone="sub" onPress={() => useGoalDraft.getState().setStage('chat')} />
        </>
      }
    >
      <Text accessibilityRole="header" style={[T.h2, { color: C.ink }]}>
        {g.planTitle}
      </Text>
      <PlanFields plan={plan} onChange={setPlan} />
    </Frame>
  );
}

// ---------- 3/3 확인 ----------

function ConfirmStage() {
  const fields = useGoalDraft((s) => s.fields);
  const plan = useGoalDraft((s) => s.plan);
  const subs = useGoalDraft((s) => s.subsituations);
  const setField = useGoalDraft((s) => s.setField);
  const createGoal = useApp((s) => s.createGoal);
  const now = useNow(30_000);
  const create = useAction();

  const scenes = subs.length ? subs : g.defaultScenes;
  const first = firstStart(now, APP_TIME_ZONE, plan);
  const clock = first.clock;
  const when =
    first.rel === 'today' ? g.today(clock) : first.rel === 'tomorrow' ? g.tomorrow(clock) : g.onDate(first.month, first.date, g.weekdayNames[first.weekday], clock);
  const days = WEEKDAY_ORDER.filter((w) => plan.weekdays.includes(w))
    .map((w) => g.weekdayNames[w])
    .join(', ');
  const blocked = !(fields.goal_name ?? '').trim() ? g.needName : crossesBoundary(plan.startMinutes, plan.targetMinutes) ? g.boundary : null;

  const start = () =>
    void create.run(async () => {
      await createGoal(toGoalInput(fields, plan, subs, g.defaultScenes));
      router.replace('/');
      useGoalDraft.getState().reset();
    });

  return (
    <Frame
      header={<SetupHeader stage="confirm" fields={fields} />}
      footer={
        <>
          <ErrorLine message={create.message} />
          <Text style={[T.small, { color: C.sub }]}>{g.startsAt(when)}</Text>
          <Button title={g.create} busy={create.busy} disabled={!!blocked} disabledReason={blocked} onPress={start} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: S.md }}>
            <TextButton title={g.toPlanBack} tone="sub" disabled={create.busy} onPress={() => useGoalDraft.getState().setStage('plan')} />
            <TextButton title={g.toChat} tone="sub" disabled={create.busy} onPress={() => useGoalDraft.getState().setStage('chat')} />
          </View>
        </>
      }
    >
      <Text accessibilityRole="header" style={[T.h2, { color: C.ink }]}>
        {g.confirmTitle}
      </Text>
      <Field label={g.fields.goal_name} value={fields.goal_name ?? ''} onChange={(v) => setField('goal_name', v)} note={g.nameNote} maxLength={FIELD_MAX.goal_name} />
      <View>
        <Row left={g.fields.place} right={fields.place} />
        <Row left={g.fields.my_role} right={fields.my_role} />
        <Row left={g.fields.partner} right={fields.partner} />
        <Row left={g.fields.task} right={fields.task} />
        <Row left={g.period} right={copy.unit.days(plan.periodDays)} />
        <Row left={g.weekdays} right={days} />
        <Row left={g.start} right={fmtClock(plan.startMinutes)} />
        <Row left={g.minutes} right={copy.unit.minutes(plan.targetMinutes)} />
      </View>
      <Field label={g.reason} value={fields.reason ?? ''} editable={false} multiline serif />
      <View style={{ gap: S.xs }}>
        <Text style={[T.label, { color: C.sub }]}>{g.scenes}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {scenes.map((s, i) => (
            <Text key={`${i}-${s}`} style={[T.small, { color: C.ink, borderWidth: B.hair, borderColor: C.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }]}>
              {`${i + 1}. ${s}`}
            </Text>
          ))}
        </View>
      </View>
    </Frame>
  );
}
