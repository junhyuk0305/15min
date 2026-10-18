import { useCallback, useEffect, useRef, useState } from 'react';
import { REVEAL } from '@/lib/motion';
import { revealDuration, visibleChars } from '@/lib/reveal';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type RevealItem = { id: string; text: string; ai: boolean };

/**
 * 글자 단위 표시(UXP 3절, 갭분석 C2). 화면에 새로 도착한 마지막 상대, 코치 줄 하나만 고른다(target).
 * 화면을 처음 그릴 때 이미 있던 줄(다시 들어옴, 강제 종료 뒤 재실행)은 고르지 않는다. 줄인 움직임이면 고르지 않는다.
 * 끝은 타이머 하나로 정한다. finish는 바로 끝낸다(화면 누름, 입력 시작). 고정된 함수라 1초마다 다시 그려지는 화면에서도 바뀌지 않는다.
 * isNew는 처음 그릴 때 없던 줄인지(등장 움직임에 쓴다).
 */
export function useReveal(items: readonly RevealItem[]) {
  const reduced = useReducedMotion();
  const [initial] = useState(() => new Set(items.map((i) => i.id)));
  const [done, setDone] = useState<string | null>(null);
  const last = items.at(-1);
  const target = !reduced && last && last.ai && last.text.trim() && !initial.has(last.id) && last.id !== done ? last.id : null;
  const text = target && last ? last.text : '';

  useEffect(() => {
    if (!target) return;
    const id = setTimeout(() => setDone(target), revealDuration(text, REVEAL));
    return () => clearTimeout(id);
  }, [target, text]);

  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);
  const finish = useCallback(() => {
    const t = targetRef.current;
    if (t) setDone(t);
  }, []);
  const isNew = useCallback((id: string) => !initial.has(id), [initial]);

  return { target, revealing: target !== null, finish, isNew };
}

/**
 * 표시 중인 줄의 보일 글자 수. 이 줄만 다시 그린다(목록 전체를 다시 그리지 않는다, UXP 6.3).
 * 어절 간격마다 도는 타이머 하나로 센다. active가 아니면 전체 길이.
 */
export function useRevealCount(text: string, active: boolean): number {
  const [n, setN] = useState(() => (active ? visibleChars(text, 0, REVEAL) : text.length));
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const id = setInterval(() => {
      const c = visibleChars(text, Date.now() - start, REVEAL);
      setN(c);
      if (c >= text.length) clearInterval(id);
    }, REVEAL.msPerWord);
    return () => clearInterval(id);
  }, [active, text]);
  return active ? n : text.length;
}
