// 사용자에게 보이는 문구는 전부 여기 둔다. 영문판은 이 파일을 언어별로 나눈다.
// 말투: 합니다체 하나. 과거의 모습은 꼬집고, 사용자를 판단해 단정하지 않는다.
// 긁는 말투는 알림, 홈의 독촉 상태, 포기 흐름, 반성문에만 쓴다. 학습 코치, 오류, 설정에는 쓰지 않는다.
// 재료는 사용자가 직접 쓴 말과 앱에 쌓인 기록뿐이다. 용어는 docs/용어집.md를 따른다.

const quote = (s: string, max = 28) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

export type NagMaterial = {
  targetMinutes: number;
  remainMinutes: number;
  goalName: string;
  reason: string;
  totalMinutes: number;
  days: number;
  /** 가장 최근 회고 2번 답(그날 하루 이야기). 없으면 null */
  lastRetro: string | null;
};

export const copy = {
  appName: '그래고',

  // 숫자와 단위는 붙여 쓴다. 15분, 3장, 7일.
  unit: {
    minutes: (n: number) => `${n.toLocaleString()}분`,
    days: (n: number) => `${n}일`,
    sheets: (n: number) => `${n}장`,
  },

  onboarding: {
    hookTitle: '하루 15분',
    hookRows: [
      ['1년', '5,475분'],
      ['3년', '16,425분'],
      ['5년', '27,375분'],
    ] as [string, string][],
    hookBody: '작아 보이는 이 시간이 쌓이면 커리어와 인생이 바뀝니다.',
    problem: '그 15분,\n매일 책상에 앉기\n어려우셨습니까?',
    problemSub: '바쁘다는 이유로 멈춘 적이 있으실 겁니다.',
    promise: '해내실 때까지\n물고 늘어지겠습니다.',
    promiseSub: '대신 정한 요일에는 무조건 하셔야 합니다.',
    goalTitle: '무엇을 해내실 겁니까?',
    scheduleTitle: '학습 요일과 시각을 정하십시오.',
    scheduleNote: '학습 요일은 주 5일 이상입니다.',
    methodTitle: '코치와 영어로 대화하며 배웁니다.',
    methodSub: '글자 수 제한은 없습니다. 화면이 켜져 있는 시간만 셉니다.',
    warnTitle: '명심하십시오.',
    warnBody: '약속한 시각에 오지 않으면 1분마다 알림을 보냅니다. 최대 60회입니다.',
    warnCoupon: '쿠폰은 3장뿐입니다. 이후에는 연속으로 해내야 받습니다.',
    warnAgree: '알림 켜기',
    permissionDenied: '알림이 꺼져 있어 시작할 수 없습니다. 설정에서 알림을 켜 주십시오.',
    openSettings: '설정 열기',
    next: '다음 보기',
    prev: '이전 보기',
  },

  goalForm: {
    nameLabel: '목표',
    namePlaceholder: '예: 영어 이메일을 막힘없이 쓰기',
    reasonLabel: '처음 이유',
    reasonPlaceholder: '왜 이걸 하려고 합니까? 나중에 이 문장을 다시 보게 됩니다.',
    reasonLocked: '처음 쓴 이유는 바꿀 수 없습니다.',
    startLabel: '학습 시작',
    hourLabel: '시작 시각',
    minuteLabel: '시작 분',
    minutesLabel: '하루 학습',
    botLabel: '기본 코치',
  },

  newGoal: {
    title: '다음 목표를 정하십시오.',
    sub: '쉬는 순간 원래대로 돌아갑니다.',
    start: '시작하기',
  },

  home: {
    total: '지금까지 모은 시간',
    milestone: (left: number, next: number) => `${next.toLocaleString()}분까지 ${left.toLocaleString()}분`,
    streak: (n: number) => `연속 ${n}일`,
    streakLabel: '연속',
    coupons: (n: number) => `쿠폰 ${n}장`,
    startIn: (m: number) => `오늘의 ${m}분까지`,
    startIn2: '남은 시간',
    soonBody: (m: number) => `곧 시작입니다. 오늘은 ${m}분입니다.`,
    graceTitle: '시작 시각이 지났습니다',
    graceBody: '아직 독촉 전입니다. 지금 시작하십시오.',
    nagTitle: '늦었습니다',
    nagLate: (m: number) => `${m}분째 시작하지 않으셨습니다.`,
    resumeTitle: (m: number) => `${m}분 남았습니다`,
    resumeBody: '나가신 순간부터 다시 알림을 보내고 있습니다.',
    doneTitle: '오늘 채웠습니다',
    doneBody: '내일도 하실 수 있겠습니까?',
    couponTitle: '오늘은 쿠폰을 썼습니다',
    couponBody: (left: number, days: number) => `남은 쿠폰은 ${left}장입니다. 다음 쿠폰까지 연속 ${days}일이 남았습니다.`,
    beforeFirstTitle: '첫 학습은 내일입니다',
    beforeFirstBody: (clock: string) => `내일 ${clock}에 시작합니다.`,
    restTitle: '오늘은 쉬는 요일입니다',
    restBody: '다음 학습 요일에 알림을 보냅니다.',
    giveupTitle: '포기 대기 중',
    giveupBody: '이 시간이 지나면 포기가 확정됩니다.',
    giveupReason: '처음 이유',
    yourReason: '처음 이유',
    start: '지금 시작',
    resume: '이어서 하기',
    withdraw: '철회하기',
    achieve: '달성 선언하기',
    achieveIn: (d: number) => `달성 선언까지 ${d}일`,
    notifOff: '알림이 꺼져 있습니다. 이대로면 아무도 부르지 않습니다.',
    botTitle: '오늘의 코치',
  },

  session: {
    reasonTitle: '오늘은 왜 하십니까?',
    reasonSub: '지난번과 같은 문장은 받지 않습니다.',
    yesterday: '지난 학습일의 이유',
    reasonPlaceholder: '오늘 이걸 하는 이유를 쓰십시오.',
    sameAsYesterday: '지난번과 같은 이유입니다. 다른 문장으로 쓰십시오.',
    begin: '시작하기',
    left: '남은 시간',
    paused: '멈춤',
    send: '보내기',
    inputPlaceholder: '영어로 답하십시오.',
    typing: '코치가 쓰는 중입니다. 이 시간은 세지 않습니다.',
    idleTitle: '딴짓 중이십니까?',
    idleBody: '입력이 없는 동안 시간이 멈춰 있습니다.',
    idleContinue: '계속하기',
    filled: '오늘의 시간을 채웠습니다.',
    toReview: '회고하기',
    stubNote: '연결 전 시험용 응답입니다.',
    reviewTitle: '오늘을 영어로 돌아봅니다.',
    reviewSub: '회고는 3분입니다. 오늘 배운 표현을 써 보십시오.',
    reviewPlaceholder: '영어로 쓰십시오.',
    finish: '완료하기',
    doneTitle: (m: number) => `오늘 ${m}분 채웠습니다.`,
    doneShake: '내일도 하실 수 있겠습니까?',
    couponEarned: '연속을 지켜 쿠폰 1장을 받았습니다.',
    ok: '홈으로 가기',
  },

  coupon: {
    title: '쿠폰',
    left: (n: number) => `${n}장 남음`,
    next: (d: number) => `다음 쿠폰까지 연속 ${d}일`,
    warn: '쓰면 연속이 0일로 돌아갑니다.',
    use: '쿠폰 쓰기',
    none: '남은 쿠폰이 없습니다. 오늘은 하셔야 합니다.',
    used: '오늘은 쉬십시오.',
    usedShake: (n: number) => `남은 쿠폰은 ${n}장입니다. 내일은 0일부터입니다.`,
    back: '돌아가기',
  },

  achieve: {
    confirmTitle: '목표를 달성하셨습니까?',
    startDate: '시작',
    elapsed: '경과',
    total: '누적',
    reason: '처음 이유',
    declare: '선언하기',
    cancel: '나중에 하기',
    doneTitle: (d: number) => `${d}일을 해내셨습니다.`,
    doneShake: '여기서 쉬면 원래대로 돌아갑니다.',
    next: '목표 정하기',
  },

  giveup: {
    title: '포기하시겠습니까?',
    scratch: (m: number) => `하루 ${m}분이 어려워서 그만두시는 겁니까?`,
    reason: '처음 이유',
    stats: (d: number, t: number) => `${d}일 동안 ${t.toLocaleString()}분`,
    waitInfo: '신청하면 24시간 뒤 포기가 확정됩니다. 그동안 2시간마다 알림을 보냅니다.',
    suspension: (days: number | null) =>
      days === null ? '확정되면 이 계정은 영구 이용 정지됩니다.' : `확정되면 ${days}일 동안 이용 정지됩니다.`,
    apply: '포기 신청하기',
    keep: '계속하기',
  },

  tabs: { home: '홈', archive: '기록', settings: '설정' },

  bots: {
    minChars: (n: number) => `최소 ${n}자`,
    builtinNames: {
      email: '비즈니스 이메일',
      freetalk: '원어민 프리토킹',
      summary: 'IT 기사 3문장 요약',
      vocab: '필수 영단어 퀴즈',
    },
  },

  archive: {
    title: '기록',
    empty: '아직 기록이 없습니다. 오늘이 첫 장입니다.',
    done: '완료',
    coupon: '쿠폰',
    missed: '실패',
    minutes: (m: number) => `${m}분`,
    chars: (n: number) => `${n.toLocaleString()}자`,
    reason: '오늘의 이유',
    review: '회고',
    chat: '대화',
    achieved: '달성한 목표',
  },

  settings: {
    title: '설정',
    goal: '목표 관리',
    notif: '알림',
    notifOn: '켜짐',
    notifOff: '꺼짐',
    coupons: '남은 쿠폰',
    change: '변경하기',
    changeNote: '변경은 내일부터 적용됩니다.',
    pending: (t: string, m: number) => `내일부터 ${t}, ${m}분`,
    shrink: (from: number, to: number) => `${from}분에서 ${to}분으로 줄이시겠습니까? 처음 약속은 ${from}분이었습니다.`,
    shrinkYes: '줄이기',
    save: '저장하기',
    saved: '저장됨',
    giveup: '포기하기',
    dev: '개발용 시간 이동',
    devStatus: (now: string, count: number, next: string | null) =>
      `지금 ${now}   예약 알림 ${count}개${next ? `   다음 ${next}` : ''}`,
    devPlus10Min: '+10분',
    devPlus1Hour: '+1시간',
    devPlus1Day: '+1일',
    devPlus30Days: '+30일',
    devReset: '시간 되돌리기',
  },

  error: {
    generic: '처리하지 못했습니다. 잠시 후 다시 시도해 주십시오.',
  },

  notify: {
    title: '그래고',
    channel: '독촉',
    pre: (m: number) => `30분 뒤 시작입니다. 오늘의 ${m}분을 준비하십시오.`,
    start: (m: number) => `시작 시각입니다. 오늘의 ${m}분을 지금 시작하십시오.`,
    devil: [
      '오늘은 쉬셔도 됩니다. 원래 그러지 않으셨습니까?',
      '아무것도 안 하던 때가 편하지 않으셨습니까?',
      '그만두고 싶으십니까? 옛날로 돌아가셔도 아무도 모릅니다.',
    ],
    noGoal: '다음 목표가 없습니다. 원래대로 돌아가시는 중입니다.',
    suspended: '반성문을 쓸 시각입니다. 왜 포기하셨는지 쓰십시오.',
  },
};

/** 독촉 문구. 재료를 돌려 같은 문장이 연속되지 않게 한다. */
export function nagLines(m: NagMaterial): string[] {
  const started = m.remainMinutes < m.targetMinutes;
  const lines = [
    started
      ? `${m.remainMinutes}분 남았습니다. 아직 끝나지 않았습니다.`
      : `오늘의 ${m.remainMinutes}분이 남았습니다. 아직 시작하지 않으셨습니다.`,
    '옛날처럼 아무것도 하지 않고 계십니다.',
    `'${quote(m.reason)}' 때문에 시작하셨습니다. 오늘은 그 이유가 없습니까?`,
    `하루 ${m.targetMinutes}분도 못 하시는 겁니까?`,
    m.totalMinutes > 0
      ? `지금까지 ${m.totalMinutes.toLocaleString()}분을 쌓으셨습니다. 오늘은 0분으로 끝내시겠습니까?`
      : `첫날부터 0분으로 끝내시겠습니까?`,
    '시간이 없다는 말은 핑계입니다. 스스로도 아실 겁니다.',
  ];
  if (m.lastRetro) lines.push(`지난 회고에서 '${quote(m.lastRetro)}'라고 쓰셨습니다. 오늘은 그냥 넘기시겠습니까?`);
  return lines;
}

/** 포기 대기 중 문구. 본인의 기록으로 긁는다. */
export function giveupLines(m: NagMaterial): string[] {
  const lines = [
    '이 모든 시간을 정말 버리시겠습니까?',
    `처음에 '${quote(m.reason)}' 때문에 시작하셨습니다. 겨우 그런 이유였습니까?`,
    `${m.days}일 동안 ${m.totalMinutes.toLocaleString()}분을 쌓으셨습니다. 그 시간을 버리시겠습니까?`,
    `목표는 '${quote(m.goalName)}'였습니다. 포기하면 옛날로 돌아갑니다.`,
    '아직 돌아올 수 있습니다. 철회 버튼 하나면 됩니다.',
  ];
  if (m.lastRetro) lines.push(`'${quote(m.lastRetro)}'라고 회고하신 날이 있습니다. 그때의 마음은 어디 갔습니까?`);
  return lines;
}
