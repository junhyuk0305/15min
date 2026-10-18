import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Composer } from '@/components/Composer';
import { CoachModal } from '@/components/learn/parts';
import { LearnShell } from '@/components/learn/LearnShell';
import { lineText, Transcript } from '@/components/learn/Transcript';
import type { PanelProps } from '@/components/learn/types';
import { ErrorLine } from '@/components/ErrorLine';
import { Button } from '@/components/ui';
import { copy } from '@/lib/copy';
import { coachModalOf, hiddenUntilClosed, linesOf, sendId, type CoachModalView, type Line } from '@/lib/learn';
import { dayKeyId, uuidv4, type Message } from '@/lib/model';
import { todayKey, useApp } from '@/lib/store';
import { markSeen, useTipSeen } from '@/lib/tips';
import { useReveal } from '@/lib/useReveal';

const t = copy.learn;
const NONE: Message[] = [];
const COACH_TIP = 'coach-modal';

/**
 * B 상황 대화(기획서 11.5). 처음에는 lesson-turn을 문장 없이 불러 되짚기와 첫 질문, 또는 오늘 대화를 받는다(결정안 7).
 * 교정이 필요하면 코치 모달이 상대의 새 질문보다 먼저 뜨고, 닫으면 새 질문이 보인다(결정안 10).
 * 새로 온 마지막 상대, 코치 줄은 글자 단위로 보이고 그동안 시계를 멈춘다(UXP 3절). 줄을 길게 누르면 신고, 복사 시트.
 * 첫 코치 모달 아래에는 닫으면 무엇이 오는지 한 줄 안내한다(갭분석 3.1-7). 모달을 읽는 시간은 활동으로 본다(UXP 3절).
 */
export function LessonPanel({ header, banner, overlay, request, setFailed, touch, offline, setRevealing, menu }: PanelProps) {
  const goal = useApp((s) => s.goal);
  const day = todayKey();
  const messages = useApp((s) => (s.goal ? s.messages[dayKeyId(s.goal.id, day)] : undefined)) ?? NONE;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState<'network' | 'other' | null>(null);
  const [failed, setSendFailed] = useState(false);
  const [modal, setModal] = useState<{ view: CoachModalView; note: string } | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const coachTipSeen = useTipSeen(COACH_TIP);
  const pending = useRef<{ id: string; text: string } | null>(null);
  const lines = useMemo(() => linesOf(messages, 'B', hidden), [messages, hidden]);
  const reveal = useReveal(lines.map((l) => ({ id: l.id, text: l.text, ai: l.kind !== 'me' })));
  useEffect(() => setRevealing(reveal.revealing), [reveal.revealing, setRevealing]);
  useEffect(() => () => setRevealing(false), [setRevealing]);
  // 헤더 "⋯"의 신고하기는 가장 최근 상대, 코치 줄을 신고한다
  const { open: openMenu, setLatest } = menu;
  const latest = lines.findLast((l) => l.kind !== 'me' && l.reportable);
  const latestId = latest?.id;
  const latestText = latest ? lineText(latest) : '';
  useEffect(() => {
    setLatest(latestId ? { id: latestId, text: latestText, send: (r) => useApp.getState().reportMessage(latestId, r) } : null);
  }, [latestId, latestText, setLatest]);
  useEffect(() => () => setLatest(null), [setLatest]);
  const onLine = useCallback(
    (l: Line) => openMenu({ id: l.id, text: lineText(l), send: l.reportable ? (r) => useApp.getState().reportMessage(l.id, r) : undefined }),
    [openMenu],
  );

  const load = useCallback(async () => {
    setBusy(true);
    const r = await request(() => useApp.getState().lessonTurn());
    setBusy(false);
    setLoaded(r.ok);
    setLoadFailed(r.ok ? null : r.error.kind === 'network' ? 'network' : 'other');
    setFailed(!r.ok);
  }, [request, setFailed]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  // 연결이 돌아오면 첫 불러오기를 다시 한다
  const reload = !offline && loadFailed === 'network';
  useEffect(() => {
    if (!reload) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [reload, load]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    touch();
    const id = sendId(pending.current, body, uuidv4);
    pending.current = { id, text: body };
    setText('');
    setBusy(true);
    const r = await request(() => useApp.getState().lessonTurn(body, id));
    setBusy(false);
    if (!r.ok) {
      setText(body); // 입력한 문장은 남긴다(MP 7.3)
      setSendFailed(true);
      setFailed(true);
      return;
    }
    pending.current = null;
    setSendFailed(false);
    setFailed(false);
    const view = coachModalOf(r.value.modal);
    if (view) {
      const note = r.value.messages.find((m) => m.role === 'coach')?.text ?? '';
      setHidden(new Set(hiddenUntilClosed(r.value.messages, id)));
      setModal({ view, note });
    }
  };

  const closeModal = () => {
    touch();
    if (!coachTipSeen) markSeen(COACH_TIP);
    setModal(null);
    setHidden(new Set());
  };

  if (!goal) return null;

  const footer = loadFailed ? (
    <>
      <ErrorLine message={t.loadFailed} />
      <Button title={t.reload} busy={busy} onPress={() => void load()} />
    </>
  ) : loaded ? (
    <Composer
      value={text}
      onChange={(v) => {
        setText(v);
        touch();
      }}
      onSend={() => void send()}
      busy={busy}
      error={failed ? t.failed : null}
      placeholder={t.inputPlaceholder}
      onInputStart={reveal.finish}
    />
  ) : null;

  return (
    <LearnShell
      theme="dark"
      header={header}
      banner={banner}
      footer={footer}
      overlay={overlay}
      follow
      count={lines.length}
      mineLast={lines.at(-1)?.kind === 'me'}
      revealing={reveal.revealing}
      onTouch={reveal.finish}
    >
      <Transcript
        lines={lines}
        partnerName={goal.situation.partner || t.coach}
        waiting={busy}
        note={t.uncounted}
        target={reveal.target}
        isNew={reveal.isNew}
        onLine={onLine}
      />
      <CoachModal modal={modal?.view ?? null} note={modal?.note} tip={coachTipSeen ? null : copy.tips.coachModal} onClose={closeModal} />
    </LearnShell>
  );
}
