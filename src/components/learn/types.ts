import type { ReactNode } from 'react';
import type { LineMenu } from '@/components/LineMenu';
import type { ApiError } from '@/lib/api';

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** 학습 화면이 단계 화면(A, C 복습, B 상황 대화)에 넘기는 것 */
export type PanelProps = {
  /** 위 시계 */
  header: ReactNode;
  /** 연결 끊김 배너 */
  banner: ReactNode;
  /** 단계 전환 안내, 딴짓 팝업 */
  overlay: ReactNode;
  /** 서버 요청. 기다리는 동안 시계를 멈추고, 연결 끊김과 한도 초과를 화면 상태로 옮긴다 */
  request: <T>(job: () => Promise<T>) => Promise<Result<T>>;
  /** 실패 안내가 떠 있는 동안 시계를 멈춘다 */
  setFailed: (failed: boolean) => void;
  /** 활동(결정안 4) */
  touch: () => void;
  /** 연결이 끊겼나. 돌아오면 불러오기를 다시 한다 */
  offline: boolean;
  /** 글자 단위 표시 중인지 알린다. 그동안 시계를 멈춘다(UXP 3절) */
  setRevealing: (revealing: boolean) => void;
  /** 줄 길게 누르기 시트(open)와 헤더 "⋯"가 신고할 가장 최근 줄(setLatest). 시트가 떠 있으면 시계가 멈춘다 */
  menu: Pick<LineMenu, 'open' | 'setLatest'>;
};
