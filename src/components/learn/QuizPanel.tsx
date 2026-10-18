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
import { FEEDBACK_MS, quizModalOf, type CoachModalView } from '@/lib/learn';
import type { QuizGrade, QuizQuestion } from '@/lib/model';
import { useApp } from '@/lib/store';
import { B, R, S, T } from '@/lib/theme';

const t = copy.learn;

/**
 * A와 C 복습(기획서 11.6). 시간이 남는 한 문항을 계속 낸다(결정안 5). 유형은 서버가 정한다(결정안 11).
 * 정답과 설명은 가린 채 먼저 답한다. 첫 시도를 낸 뒤에만 설명을 열 수 있고, 다음 답은 도움 받은 답이 된다(결정안 12).
 * 맞으면 잠깐 안내하고 다음 문항. 틀리면 한 번 더 답하거나 넘어간다.
 */
export function QuizPanel({ phase, header, banner, overlay, request, setFailed, touch, offline }: PanelProps & { phase: 'A' | 'C' }) {
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [grade, setGrade] = useState<QuizGrade | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [aided, setAided] = useState(false);
  const [explain, setExplain] = useState<CoachModalView | null>(null);
  const [busy, setBusy] = useState(false);
  /** 'next': 문항을 못 받음, 'grade': 채점을 못 받음 */
  const [failure, setFailure] = useState<'next' | 'grade' | null>(null);
  const [netFail, setNetFail] = useState(false);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const report = useReport(touch);

  const fail = useCallback(
    (f: 'next' | 'grade' | null) => {
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
  }, [phase, request, fail]);

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

  const submit = async () => {
    const ans = given();
    if (!q || !ans || busy) return;
    touch();
    setBusy(true);
    const r = await request(() => useApp.getState().quizGrade(phase, q.id, ans, aided || attempts > 0));
    setBusy(false);
    if (!r.ok) return fail('grade');
    fail(null);
    const n = attempts + 1;
    setAttempts(n);
    setGrade(r.value);
    const canRetry = !r.value.correct && n === 1 && quizModalOf(r.value.modal) !== null;
    if (!canRetry) advance.current = setTimeout(() => void next(), FEEDBACK_MS);
    else if (q.type === 'meaning_choice') setChoice(null);
  };

  const openExplain = () => {
    const m = grade ? quizModalOf(grade.modal) : null;
    if (!m) return;
    touch();
    setAided(true);
    setExplain(m.kind === 'word' ? { expression: null, words: [m] } : { expression: m, words: [] });
  };

  const retrying = !!grade && !grade.correct && attempts === 1 && quizModalOf(grade.modal) !== null;
  const settled = !!grade && !retrying;

  let footer = null;
  if (failure) {
    footer = (
      <>
        <ErrorLine message={t.failed} />
        <Button title={t.resend} busy={busy} onPress={() => void (failure === 'next' ? next() : submit())} />
      </>
    );
  } else if (q && !settled) {
    const extra = retrying ? (
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: S.lg }}>
        <TextButton title={t.explain} onPress={openExplain} disabled={busy} />
        <TextButton title={t.skip} tone="sub" onPress={() => void next()} disabled={busy} />
      </View>
    ) : null;
    footer =
      q.type === 'meaning_choice' ? (
        <>
          <Button
            title={retrying ? t.retry : t.submit}
            busy={busy}
            disabled={choice === null}
            disabledReason={t.pickChoice}
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

  return (
    <LearnShell theme={themeOf(phase)} header={header} banner={banner} footer={footer} overlay={overlay}>
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
      {grade ? <Feedback grade={grade} retrying={retrying} /> : null}
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
  onReport: () => void;
}) {
  const { p } = useSurface();
  const [first, ...rest] = q.prompt.split('\n');
  return (
    <View style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>{q.levelCheck ? t.levelCheck(q.index + 1) : t.question(q.index + 1)}</Label>
        <ReportButton onPress={onReport} />
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

function Feedback({ grade, retrying }: { grade: QuizGrade; retrying: boolean }) {
  const { p } = useSurface();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: S.xs, borderTopWidth: B.hair, borderTopColor: p.line, paddingTop: S.md }}>
      <Text style={[T.h2, { color: grade.correct ? p.ink : p.redText }]}>{grade.correct ? t.right : t.wrong}</Text>
      {grade.feedback ? <Body>{grade.feedback}</Body> : null}
      {retrying ? <Body muted>{t.retryNote}</Body> : null}
    </View>
  );
}
