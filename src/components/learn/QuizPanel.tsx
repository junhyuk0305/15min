import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { ErrorLine } from '@/components/ErrorLine';
import { CoachModal, themeOf } from '@/components/learn/parts';
import { LearnShell } from '@/components/learn/LearnShell';
import type { PanelProps } from '@/components/learn/types';
import { useSurface } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import * as haptics from '@/lib/haptics';
import { FEEDBACK_MS, quizModalOf, quizStep, revealedChoice, type CoachModalView } from '@/lib/learn';
import type { QuizGrade, QuizQuestion } from '@/lib/model';
import { DUR, EASE } from '@/lib/motion';
import { useApp } from '@/lib/store';
import { B, R, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const t = copy.learn;

type Failure = 'next' | 'grade' | 'skip';

/**
 * A와 C 복습(기획서 11.6). 시간이 남는 한 문항을 계속 낸다(결정안 5). 유형은 서버가 정한다(결정안 11).
 * 정답과 설명은 가린 채 먼저 답한다. 첫 오답이면 서버가 정답을 감추고(answer_en 빈 값) 한 번 더 받는다.
 * 그때 다시 답하거나, 설명을 보거나(상황 적용만), 정답을 본다(skip). 두 번째 오답이나 정답 보기면 정답을 보이고
 * 사용자가 다음 문제 보기를 누른다. 맞으면 잠깐 안내하고 다음 문항. 첫날 A는 수준 확인이다.
 * 피드백(갭분석 F3, M18, V6): 고른 보기는 검정 바탕. 정답은 체크가 튀고 success 햅틱, 오답은 고른 보기 테두리 빨강과 흔들림, error 햅틱.
 * 정답을 보이면 정답 보기에 검정 테두리. 줄인 움직임이면 색만 바뀐다.
 */
export function QuizPanel({
  phase,
  header,
  banner,
  overlay,
  request,
  setFailed,
  touch,
  offline,
  menu,
  onLevelCheck,
}: PanelProps & { phase: 'A' | 'C'; onLevelCheck?: (levelCheck: boolean) => void }) {
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [grade, setGrade] = useState<QuizGrade | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [aided, setAided] = useState(false);
  const [explain, setExplain] = useState<CoachModalView | null>(null);
  const [busy, setBusy] = useState(false);
  /** 'next': 문항을 못 받음, 'grade': 채점을 못 받음, 'skip': 정답을 못 받음 */
  const [failure, setFailure] = useState<Failure | null>(null);
  const [netFail, setNetFail] = useState(false);
  /** 틀린 답. 뜻 고르기면 고른 보기 번호(index), n은 틀릴 때마다 늘어 흔들림을 다시 시작한다 */
  const [wrong, setWrong] = useState<{ index: number | null; n: number } | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 상황 적용 문항의 상대 대사는 AI가 쓴다. 길게 누르기와 헤더 "⋯"로 신고한다(Play AI 생성 콘텐츠 정책, UXP 3절)
  const { open: openMenu, setLatest } = menu;
  const situationId = q?.type === 'situation' ? q.id : null;
  const situationText = q?.type === 'situation' ? q.prompt : '';
  const situation = useMemo(
    () => (situationId ? { id: situationId, text: situationText, send: (r: string) => useApp.getState().reportMessage(situationId, r) } : null),
    [situationId, situationText],
  );
  useEffect(() => setLatest(situation), [situation, setLatest]);
  useEffect(() => () => setLatest(null), [setLatest]);

  const fail = useCallback(
    (f: Failure | null) => {
      setFailure(f);
      setFailed(f !== null);
    },
    [setFailed],
  );

  const next = useCallback(async () => {
    setBusy(true);
    const r = await request(() => useApp.getState().quizNext(phase));
    setBusy(false);
    setNetFail(!r.ok && r.error.kind === 'network');
    if (!r.ok) return fail('next');
    fail(null);
    setQ(r.value);
    setAnswer('');
    setChoice(null);
    setGrade(null);
    setAttempts(0);
    setAided(false);
    setWrong(null);
    onLevelCheck?.(r.value.levelCheck);
  }, [phase, request, fail, onLevelCheck]);

  useEffect(() => {
    const id = setTimeout(() => void next(), 0);
    return () => {
      clearTimeout(id);
      if (advance.current) clearTimeout(advance.current);
    };
  }, [next]);

  // 연결이 돌아오면 못 받은 문항을 다시 받는다
  const reload = !offline && failure === 'next' && netFail;
  useEffect(() => {
    if (!reload) return;
    const id = setTimeout(() => void next(), 0);
    return () => clearTimeout(id);
  }, [reload, next]);

  const given = () => (q?.type === 'meaning_choice' ? (choice !== null ? (q.choices?.[choice] ?? '') : '') : answer.trim());

  const show = (g: QuizGrade) => {
    setGrade(g);
    const step = quizStep(g);
    if (step === 'right') advance.current = setTimeout(() => void next(), FEEDBACK_MS);
    else if (step === 'retry' && q?.type === 'meaning_choice') setChoice(null);
  };

  const submit = async () => {
    const ans = given();
    if (!q || !ans || busy) return;
    touch();
    setBusy(true);
    const r = await request(() => useApp.getState().quizGrade(phase, q.id, ans, aided || attempts > 0));
    setBusy(false);
    if (!r.ok) return fail('grade');
    fail(null);
    setAttempts(attempts + 1);
    if (r.value.correct) haptics.success();
    else {
      haptics.error();
      setWrong((w) => ({ index: q.type === 'meaning_choice' ? choice : null, n: (w?.n ?? 0) + 1 }));
    }
    show(r.value);
  };

  /** 정답 보기. 답하지 않고 정답을 받는다(틀림으로 센다) */
  const reveal = async () => {
    if (!q || busy) return;
    touch();
    setBusy(true);
    const r = await request(() => useApp.getState().quizSkip(phase, q.id));
    setBusy(false);
    if (!r.ok) return fail('skip');
    fail(null);
    show(r.value);
  };

  const modal = grade ? quizModalOf(grade.modal) : null;
  const openExplain = () => {
    if (!modal) return;
    touch();
    setAided(true);
    setExplain(modal.kind === 'word' ? { expression: null, words: [modal] } : { expression: modal, words: [] });
  };

  const step = grade ? quizStep(grade) : null;
  const retrying = step === 'retry';
  const settled = step === 'right' || step === 'revealed';
  const explainButton = modal ? <TextButton title={t.explain} onPress={openExplain} disabled={busy} /> : null;

  let footer = null;
  if (failure) {
    const again = failure === 'next' ? next : failure === 'skip' ? reveal : submit;
    footer = (
      <>
        <ErrorLine message={failure === 'next' ? t.loadFailed : t.failed} />
        <Button title={failure === 'next' ? t.reload : t.resend} busy={busy} onPress={() => void again()} />
      </>
    );
  } else if (q && step === 'revealed') {
    footer = (
      <>
        <Button title={t.nextQuestion} busy={busy} onPress={() => void next()} />
        {explainButton}
      </>
    );
  } else if (q && !settled) {
    const extra = retrying ? (
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: S.lg }}>
        {explainButton}
        <TextButton title={t.reveal} tone="sub" onPress={() => void reveal()} disabled={busy} />
      </View>
    ) : null;
    footer =
      q.type === 'meaning_choice' ? (
        <>
          <Button
            title={retrying ? t.retry : t.submit}
            busy={busy}
            disabled={choice === null}
            onPress={() => void submit()}
          />
          {extra}
        </>
      ) : (
        <>
          <AnswerInput
            value={answer}
            onChange={(v) => {
              setAnswer(v);
              touch();
            }}
            onSubmit={() => void submit()}
            editable={!busy}
          />
          <Button title={retrying ? t.retry : t.submit} busy={busy} disabled={!answer.trim()} onPress={() => void submit()} />
          {extra}
        </>
      );
  }

  // 채점 결과는 보기 아래에 붙는다. 작은 화면에서도 보이게 내리고(follow), 새 문항이면 맨 위로 올린다(topKey)
  return (
    <LearnShell theme={themeOf(phase)} header={header} banner={banner} footer={footer} overlay={overlay} follow={!!grade} topKey={q?.id}>
      {q?.levelCheck ? <Body muted>{t.levelNote}</Body> : null}
      {q ? (
        <Question
          q={q}
          choice={choice}
          locked={busy || settled}
          settled={settled}
          wrong={wrong}
          right={step === 'revealed' ? revealedChoice(q.choices, grade?.feedback ?? '') : -1}
          onChoose={(i) => {
            touch();
            haptics.select();
            setChoice(i);
          }}
          onLongPress={situation ? () => openMenu(situation) : undefined}
        />
      ) : busy ? (
        <Body muted>{t.preparing}</Body>
      ) : null}
      {grade ? <Feedback grade={grade} shakeKey={q?.type !== 'meaning_choice' && wrong ? wrong.n : 0} /> : null}
      <CoachModal
        modal={explain}
        onClose={() => {
          touch();
          setExplain(null);
        }}
      />
    </LearnShell>
  );
}

function Question({
  q,
  choice,
  wrong,
  right,
  locked,
  settled,
  onChoose,
  onLongPress,
}: {
  q: QuizQuestion;
  choice: number | null;
  wrong: { index: number | null; n: number } | null;
  /** 정답을 보였을 때 정답 보기 번호. 없으면 -1 */
  right: number;
  locked: boolean;
  /** 맞았거나 정답을 공개해 더 답하지 않는다 */
  settled: boolean;
  onChoose: (i: number) => void;
  /** 상황 적용 문항만. 상대 대사를 AI가 써서 신고할 수 있어야 한다(Play AI 생성 콘텐츠 정책). 나머지 유형은 서버가 만든 글이다 */
  onLongPress?: () => void;
}) {
  const { p } = useSurface();
  const [first, ...rest] = q.prompt.split('\n');
  return (
    <View style={{ gap: S.md }}>
      <Label>{q.levelCheck ? t.levelCheck(q.index + 1) : t.question(q.index + 1)}</Label>
      <Pressable onLongPress={onLongPress} delayLongPress={400} disabled={!onLongPress}>
        <Text style={[T.bodySerif, { fontSize: 17, lineHeight: 28, color: p.ink }]}>{first}</Text>
      </Pressable>
      {rest.join('\n').trim() ? <Text style={[T.body, { color: p.sub }]}>{rest.join('\n').trim()}</Text> : null}
      {q.choices?.map((c, i) => {
        // 틀린 보기는 빨강 테두리. 다시 답하는 중에 같은 보기를 또 고르면 고른 표시가 이긴다. 정답을 공개한 뒤에는 틀린 표시가 이긴다
        const missed = wrong?.index === i && (choice !== i || settled);
        const on = choice === i && !missed;
        return (
          <Shake key={`${i}:${c}`} shakeKey={missed ? wrong.n : 0}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: choice === i, disabled: locked }}
              accessibilityLabel={`${t.choiceLabel(i + 1)} ${c}`}
              disabled={locked}
              onPress={() => onChoose(i)}
              style={{
                minHeight: 48,
                justifyContent: 'center',
                borderWidth: missed || right === i ? 2 : B.base,
                borderRadius: R.md,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderColor: missed ? p.redText : on || right === i ? p.ink : p.line,
                backgroundColor: on ? p.ink : 'transparent',
              }}
            >
              <Text style={[T.body, { color: on ? p.onInk : p.ink }]}>{c}</Text>
            </Pressable>
          </Shake>
        );
      })}
    </View>
  );
}

/** 복습 답 한 줄 입력(갭분석 C4). 키보드의 보내기 키로 제출한다. 영어 답이라 자동 대문자와 자동 고침을 끈다 */
function AnswerInput({ value, onChange, onSubmit, editable }: { value: string; onChange: (v: string) => void; onSubmit: () => void; editable: boolean }) {
  const { p } = useSurface();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onSubmitEditing={() => value.trim() && onSubmit()}
      placeholder={t.answerPlaceholder}
      placeholderTextColor={p.sub}
      accessibilityLabel={t.answerPlaceholder}
      editable={editable}
      returnKeyType="send"
      submitBehavior="submit"
      autoCapitalize="none"
      autoCorrect={false}
      style={[T.body, { minHeight: 44, borderWidth: B.base, borderColor: p.ink, borderRadius: 22, backgroundColor: p.card, color: p.ink, paddingHorizontal: S.md }]}
    />
  );
}

/** 가로 흔들림 1회 240ms(갭분석 M18). shakeKey가 0보다 크고 바뀔 때마다 한 번. 줄인 움직임이면 흔들지 않는다 */
function Shake({ shakeKey, children }: { shakeKey: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!shakeKey || reduced) return;
    x.value = withSequence(withTiming(-6, { duration: 40 }), withTiming(6, { duration: 60 }), withTiming(-4, { duration: 60 }), withTiming(0, { duration: 80 }));
  }, [shakeKey, reduced, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 정답 체크. 크기 0.8에서 1로 튄다(갭분석 F3). 줄인 움직임이면 바로 1 */
function CheckMark({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const k = useSharedValue(reduced ? 1 : 0.8);
  useEffect(() => {
    if (!reduced) k.value = withSequence(withTiming(1.08, { duration: DUR.fast, easing: EASE }), withTiming(1, { duration: DUR.fast - 40 }));
  }, [reduced, k]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return (
    <Animated.View accessible={false} importantForAccessibility="no-hide-descendants" style={[{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View style={{ width: 9, height: 16, borderRightWidth: 3, borderBottomWidth: 3, borderColor: color, transform: [{ translateY: -2 }, { rotate: '45deg' }] }} />
    </Animated.View>
  );
}

function Feedback({ grade, shakeKey }: { grade: QuizGrade; shakeKey: number }) {
  const { p } = useSurface();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: S.xs, borderTopWidth: B.hair, borderTopColor: p.line, paddingTop: S.md }}>
      <Shake shakeKey={shakeKey}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs }}>
          {grade.correct ? <CheckMark color={p.ink} /> : null}
          <Text style={[T.h2, { color: grade.correct ? p.ink : p.redText }]}>{grade.correct ? t.right : t.wrong}</Text>
        </View>
      </Shake>
      {grade.feedback ? <Body>{grade.feedback}</Body> : null}
    </View>
  );
}
