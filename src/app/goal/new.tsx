import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Text, View } from 'react-native';
import { ConfirmSheet } from '@/components/BottomSheet';
import { Composer } from '@/components/Composer';
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
import { HeaderMore } from '@/components/Header';
import { Transcript } from '@/components/learn/Transcript';
import { useLineMenu } from '@/components/LineMenu';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Field, Row, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import type { Line } from '@/lib/learn';
import { APP_TIME_ZONE, crossesBoundary, fmtClock, MIN_NOTE_CHARS } from '@/lib/rules';
import { useApp } from '@/lib/store';
import { markSeen, useTipSeen } from '@/lib/tips';
import { useAction } from '@/lib/useAction';
import { useReveal } from '@/lib/useReveal';
import { B, C, S, T } from '@/lib/theme';

// 목표 설정 (MP 3절, 결정안 1, 8). 첫 목표와 달성 뒤 새 목표가 모두 이 화면이다. 닫기 없음, 화면 밖으로 뒤로 가기 막음.
// 2/3, 3/3은 헤더 chevron과 Android 뒤로가 앞 단계로 간다. 1/3은 강제 화면이라 chevron 대신 이유 한 줄이다(갭분석 N6).
// 1/3 채팅(goal-setup): 이유 → 장소 → 내 역할 → 상대 → 해결할 일 → 목표 이름.
// 2/3 위젯: 기간, 학습 요일, 시작 시각, 하루 학습 분. 3/3 확인 카드 → create_goal → 홈.
// 만들면 route.ts가 /goal/new를 홈으로 보낸다.

const g = copy.goalSetup;
const INTRO_TIP = 'goal-intro';
const startIntro = () => markSeen(INTRO_TIP);

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
  // 첫 줄은 앱이 쓴 고정 질문이라 신고하지 않는다. 그 뒤 코치 답만 신고한다(report_ai_text, 대화를 저장하지 않아 글을 함께 보낸다)
  const view = useMemo<Line[]>(
    () =>
      lines.map((l, i) =>
        l.role === 'user'
          ? { key: l.id, kind: 'me', text: l.text, id: l.id, pending: false, reportable: false }
          : { key: l.id, kind: 'coach', text: l.text, id: l.id, modal: null, reportable: i > 0 },
      ),
    [lines],
  );
  const reveal = useReveal(view.map((l) => ({ id: l.id, text: l.text, ai: l.kind !== 'me' })));
  const menu = useLineMenu();
  // 처음 들어오면 어떻게 정하는지 시트 한 장(갭분석 3.1-2). 닫아도 시작이다
  const introSeen = useTipSeen(INTRO_TIP);
  const { open: openMenu, setLatest } = menu;
  // Transcript는 memo다. 넘기는 함수를 고정해 입력할 때마다 목록을 다시 그리지 않게 한다(UXP 6.3)
  const onLine = useCallback(
    (l: Line) =>
      openMenu({
        id: l.id,
        text: l.text,
        send: l.reportable ? (r) => useApp.getState().reportAiText('goal-setup', l.text, r) : undefined,
      }),
    [openMenu],
  );
  // 헤더 "⋯"의 신고하기는 가장 최근 코치 답을 신고한다
  const latest = view.findLast((l) => l.kind !== 'me' && l.reportable);
  const latestId = latest?.id;
  const latestText = latest?.text ?? '';
  useEffect(() => {
    setLatest(latestId ? { id: latestId, text: latestText, send: (r) => useApp.getState().reportAiText('goal-setup', latestText, r) } : null);
  }, [latestId, latestText, setLatest]);

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
  // 빠른 답 칩은 코치 질문이 다 보인 뒤에 보인다
  const asked = !busy && !reveal.revealing && last?.role === 'coach';
  const chips = asked ? choicesOf(last.text) : [];
  if (asked && fields.goal_name && !done) chips.push(g.acceptName);
  const askingReason = missingFields(fields).includes('reason');
  const n = text.trim().length;
  // 이유를 묻는 동안은 20자부터 보낸다. 카운터는 입력창 안에 있고, 쓰기 시작했는데 모자라면 위에 빨강 한 줄(UXP 3절 빨강 안내)
  const short = askingReason ? Math.max(0, MIN_NOTE_CHARS - n) : 0;

  return (
    <Frame
      stick
      chat={{ count: view.length, mineLast: last?.role === 'user', revealing: reveal.revealing, onTouch: reveal.finish }}
      header={<SetupHeader stage="chat" fields={fields} right={latestId ? <HeaderMore onPress={menu.more} /> : undefined} />}
      footer={
        <>
          {chips.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {chips.map((c) => (
                <Chip key={c} reply label={c} onPress={() => void send(c)} />
              ))}
            </View>
          ) : null}
          {n > 0 && short > 0 ? <Text style={[T.small, { color: C.redText }]}>{g.needChars(short)}</Text> : null}
          <Composer
            value={text}
            onChange={setText}
            onSend={() => void send(text)}
            busy={busy}
            error={error}
            min={askingReason ? MIN_NOTE_CHARS : undefined}
            maxLength={FIELD_MAX.reason}
            placeholder={g.placeholder}
            onInputStart={reveal.finish}
          />
          {done ? <TextButton title={g.toPlan} onPress={() => useGoalDraft.getState().setStage('plan')} /> : null}
        </>
      }
    >
      <Transcript
        lines={view}
        partnerName={g.coach}
        coachSpeaks
        waiting={busy}
        target={reveal.target}
        isNew={reveal.isNew}
        onLine={onLine}
      />
      {menu.sheets}
      <ConfirmSheet visible={!introSeen} onClose={startIntro} title={copy.tips.goalIntroTitle} body={copy.tips.goalIntroBody} primary={copy.tips.goalIntroStart} onPrimary={startIntro} />
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
      header={<SetupHeader stage="plan" fields={fields} onBack={() => useGoalDraft.getState().setStage('chat')} />}
      footer={
        <Button
          title={g.toConfirm}
          disabled={!!reason}
          disabledReason={reason}
          onPress={() => useGoalDraft.getState().setStage('confirm')}
        />
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
  // 만드는 중에는 Android 뒤로도 막는다(헤더 chevron과 같게). 나중에 단 듣기가 먼저 불려 위의 단계 이동보다 앞선다
  useEffect(() => {
    if (!create.busy) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [create.busy]);

  const scenes = subs.length ? subs : g.defaultScenes;
  const first = firstStart(now, APP_TIME_ZONE, plan);
  const clock = first.clock;
  const when = first.rel === 'tomorrow' ? g.tomorrow(clock) : g.onDate(first.month, first.date, g.weekdayNames[first.weekday], clock);
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
      header={<SetupHeader stage="confirm" fields={fields} onBack={() => !create.busy && useGoalDraft.getState().setStage('plan')} />}
      footer={
        <>
          <ErrorLine message={create.message} />
          <Text style={[T.small, { color: C.sub }]}>{g.startsAt(when)}</Text>
          <Button title={g.create} busy={create.busy} disabled={!!blocked} disabledReason={blocked} onPress={start} />
        </>
      }
    >
      <Text accessibilityRole="header" style={[T.h2, { color: C.ink }]}>
        {g.confirmTitle}
      </Text>
      <Field label={g.fields.goal_name} value={fields.goal_name ?? ''} onChange={(v) => setField('goal_name', v)} maxLength={FIELD_MAX.goal_name} />
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
