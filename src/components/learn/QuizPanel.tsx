import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { CoachModal, Composer, ReportButton, themeOf, useReport } from '@/components/learn/parts';
import { LearnShell } from '@/components/learn/LearnShell';
import type { PanelProps } from '@/components/learn/types';
import { useSurface } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { FEEDBACK_MS, quizModalOf, quizStep, type CoachModalView } from '@/lib/learn';
import type { QuizGrade, QuizQuestion } from '@/lib/model';
import { useApp } from '@/lib/store';
import { B, R, S, T } from '@/lib/theme';

const t = copy.learn;

type Failure = 'next' | 'grade' | 'skip';

/**
 * A와 C 복습(기획서 11.6). 시간이 남는 한 문항을 계속 낸다(결정안 5). 유형은 서버가 정한다(결정안 11).
 * 정답과 설명은 가린 채 먼저 답한다. 첫 오답이면 서버가 정답을 감추고(answer_en 빈 값) 한 번 더 받는다.
 * 그때 다시 답하거나, 설명을 보거나(상황 적용만), 정답을 본다(skip). 두 번째 오답이나 정답 보기면 정답을 보이고
 * 사용자가 다음 문제 보기를 누른다. 맞으면 잠깐 안내하고 다음 문항. 첫날 A는 수준 확인이다.
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
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const report = useReport(touch);

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
          <Composer
            value={answer}
            onChange={(v) => {
              setAnswer(v);
              touch();
            }}
            onSend={() => void submit()}
            busy={busy}
            failed={false}
            placeholder={t.answerPlaceholder}
            sendTitle={retrying ? t.retry : t.submit}
          />
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
          onChoose={(i) => {
            touch();
            setChoice(i);
          }}
          onReport={() => report.open(q.id)}
        />
      ) : busy ? (
        <Body muted>{t.preparing}</Body>
      ) : null}
      {grade ? <Feedback grade={grade} /> : null}
      <CoachModal
        modal={explain}
        onClose={() => {
          touch();
          setExplain(null);
        }}
      />
      {report.sheet}
    </LearnShell>
  );
}

function Question({
  q,
  choice,
  locked,
  onChoose,
  onReport,
}: {
  q: QuizQuestion;
  choice: number | null;
  locked: boolean;
  onChoose: (i: number) => void;
  /** 상황 적용 문항만. 상대 대사를 AI가 써서 신고할 수 있어야 한다(Play AI 생성 콘텐츠 정책). 나머지 유형은 서버가 만든 글이다 */
  onReport: () => void;
}) {
  const { p } = useSurface();
  const [first, ...rest] = q.prompt.split('\n');
  return (
    <View style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>{q.levelCheck ? t.levelCheck(q.index + 1) : t.question(q.index + 1)}</Label>
        {q.type === 'situation' ? <ReportButton onPress={onReport} /> : null}
      </View>
      <Text style={[T.bodySerif, { fontSize: 17, lineHeight: 28, color: p.ink }]}>{first}</Text>
      {rest.join('\n').trim() ? <Text style={[T.body, { color: p.sub }]}>{rest.join('\n').trim()}</Text> : null}
      {q.choices?.map((c, i) => {
        const on = choice === i;
        return (
          <Pressable
            key={`${i}:${c}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: locked }}
            accessibilityLabel={`${t.choiceLabel(i + 1)} ${c}`}
            disabled={locked}
            onPress={() => onChoose(i)}
            style={{
              minHeight: 48,
              justifyContent: 'center',
              borderWidth: B.base,
              borderRadius: R.md,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderColor: on ? p.ink : p.line,
              backgroundColor: on ? p.card : 'transparent',
            }}
          >
            <Text style={[T.body, { color: p.ink }]}>{c}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Feedback({ grade }: { grade: QuizGrade }) {
  const { p } = useSurface();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: S.xs, borderTopWidth: B.hair, borderTopColor: p.line, paddingTop: S.md }}>
      <Text style={[T.h2, { color: grade.correct ? p.ink : p.redText }]}>{grade.correct ? t.right : t.wrong}</Text>
      {grade.feedback ? <Body>{grade.feedback}</Body> : null}
    </View>
  );
}
