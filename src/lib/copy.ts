// 사용자에게 보이는 문구는 전부 여기 둔다. 영문판은 이 파일을 언어별로 나눈다.
// 말투: 정중한 존댓말. 과거의 모습은 꼬집고, 사용자를 판단해 단정하지 않는다.
// 재료는 사용자가 직접 쓴 말과 앱에 쌓인 기록뿐이다.

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
  lastReview: string | null;
};

export const copy = {
  appName: '그래고',

  onboarding: {
    hookTitle: '하루 15분',
    hookRows: [
      ['1년', '5,475분'],
      ['3년', '16,425분'],
      ['5년', '27,375분'],
    ] as [string, string][],
    hookBody: '작아 보이는 이 시간이 쌓이면 커리어와 인생이 바뀝니다.',
    problem: '그 15분,\n매일 책상에 앉기\n어려우셨죠?',
    problemSub: '바쁘다는 이유로 멈춘 적이 있으실 겁니다.',
    promise: '해내실 때까지\n물고 늘어지겠습니다.',
    promiseSub: '대신 무조건 하셔야 합니다. 매일.',
    goalTitle: '무엇을 해내실 겁니까?',
    scheduleTitle: '매일 언제, 몇 분 하시겠습니까?',
    scheduleNote: '매일 합니다. 쉬는 요일은 없습니다.',
    methodTitle: 'AI 코치와 대화하며 미션을 해결합니다.',
    methodSub: '100자를 넘겨야 보낼 수 있습니다. 생각하는 시간만 차감됩니다.',
    warnTitle: '명심하십시오.',
    warnBody: '약속한 시간에 오지 않으면 1분마다 연락합니다. 최대 1시간 동안.',
    warnCoupon: '예외 쿠폰은 3장뿐입니다. 이후에는 연속으로 해내야 받습니다.',
    warnAgree: '동의하고 알림 켜기',
    permissionDenied: '알림이 꺼져 있으면 시작할 수 없습니다.',
    openSettings: '설정 열기',
    next: '다음',
    prev: '이전',
  },

  goalForm: {
    nameLabel: '목표',
    namePlaceholder: '예: 영어 이메일을 막힘없이 쓰기',
    reasonLabel: '나의 이유',
    reasonPlaceholder: '왜 이걸 하려고 합니까? 나중에 이 문장을 다시 보게 됩니다.',
    reasonLocked: '처음 쓴 이유는 바꿀 수 없습니다.',
    startLabel: '매일 시작',
    hourLabel: '시작 시각',
    minuteLabel: '시작 분',
    minutesLabel: '하루 학습',
    botLabel: '기본 코치',
  },

  newGoal: {
    title: '다음 목표를 정하십시오.',
    sub: '쉬는 순간 원래대로 돌아갑니다.',
    start: '시작',
  },

  home: {
    total: '지금까지 모은 시간',
    milestone: (left: number, next: number) => `${next.toLocaleString()}분까지 ${left.toLocaleString()}분`,
    streak: (n: number) => `연속 ${n}일`,
    streakLabel: '연속',
    coupons: (n: number) => `쿠폰 ${n}장`,
    startIn: (m: number) => `오늘의 ${m}분까지`,
    startIn2: '남은 시간',
    soonBody: (m: number) => `곧 시작입니다. 오늘 ${m}분.`,
    graceTitle: '시작 시각이 지났습니다',
    graceBody: '아직 독촉 전입니다. 지금 시작하십시오.',
    nagTitle: '늦었습니다',
    nagLate: (m: number) => `${m}분째 시작하지 않으셨습니다.`,
    resumeTitle: (m: number) => `${m}분 남았습니다`,
    resumeBody: '나가신 순간부터 다시 연락하고 있습니다.',
    doneTitle: '오늘 채웠습니다',
    doneBody: '내일도 하실 수 있겠습니까?',
    couponTitle: '오늘은 쉬는 날입니다',
    couponBody: (left: number, days: number) => `남은 쿠폰 ${left}장. 다음 쿠폰까지 ${days}일 연속.`,
    giveupTitle: '포기 대기 중',
    giveupBody: '이 시간이 지나면 목표가 끝납니다.',
    giveupReason: '처음 이유',
    yourReason: '시작하신 이유',
    start: '지금 시작',
    resume: '이어서 하기',
    withdraw: '포기 철회',
    achieve: '목표 달성 선언',
    achieveIn: (d: number) => `달성 선언까지 ${d}일`,
    notifOff: '알림이 꺼져 있습니다. 이대로면 아무도 당신을 부르지 않습니다.',
    botTitle: '오늘의 코치',
  },

  session: {
    reasonTitle: '오늘은 왜 하십니까?',
    reasonSub: '어제와 같은 문장은 받지 않습니다.',
    yesterday: '어제의 이유',
    reasonPlaceholder: '오늘 이걸 하는 이유를 쓰십시오.',
    sameAsYesterday: '어제와 같은 이유입니다.',
    begin: '시작',
    left: '남은 시간',
    paused: '멈춤',
    send: '보내기',
    inputPlaceholder: '영어로 답하십시오.',
    typing: '코치가 쓰는 중입니다. 이 시간은 차감하지 않습니다.',
    idleTitle: '딴짓 중이십니까?',
    idleBody: '입력이 없는 동안 시간이 멈춰 있습니다.',
    idleContinue: '계속하기',
    filled: '오늘의 시간을 채웠습니다.',
    toReview: '소감 쓰기',
    stubNote: 'AI 연결 전 시험용 응답입니다.',
    reviewTitle: '오늘 무엇을 느끼셨습니까?',
    reviewSub: '이 문장은 언젠가 당신에게 돌아갑니다.',
    reviewPlaceholder: '오늘의 소감을 쓰십시오.',
    finish: '완료',
    doneTitle: (m: number) => `오늘 ${m}분 채웠습니다.`,
    doneShake: '내일도 하실 수 있겠습니까?',
    couponEarned: '연속을 지켜 쿠폰 1장을 받았습니다.',
    ok: '확인',
    charCount: (n: number, min: number) => `${n}/${min}`,
  },

  coupon: {
    title: '예외 쿠폰',
    left: (n: number) => `${n}장 남음`,
    next: (d: number) => `다음 쿠폰까지 ${d}일 연속`,
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
    declare: '달성 선언',
    cancel: '아직입니다',
    doneTitle: (d: number) => `${d}일을 해내셨습니다.`,
    doneShake: '여기서 쉬면 원래대로 돌아갑니다.',
    next: '다음 목표 정하기',
  },

  giveup: {
    title: '포기하시겠습니까?',
    scratch: (m: number) => `하루 ${m}분이 어려워서 그만두시는 겁니까?`,
    reason: '처음 이유',
    stats: (d: number, t: number) => `${d}일 동안 ${t.toLocaleString()}분`,
    waitsLeft: (n: number) => `포기 대기 남은 횟수 ${n}번`,
    waitInfo: '신청하면 24시간 뒤 목표가 끝납니다. 그동안에도 연락은 계속됩니다.',
    apply: '포기 신청',
    keep: '계속하기',
    deleteTitle: '포기 4번째입니다.',
    deleteBody: '지금 포기하면 목표와 기록이 전부 삭제됩니다. 되돌릴 수 없습니다.',
    deleteConfirm: '삭제',
    deleted: '목표와 기록이 삭제되었습니다.',
  },

  tabs: { home: '홈', bots: '코치', archive: '기록', settings: '설정' },

  bots: {
    title: '코치',
    builtin: '기본',
    mine: '내 코치',
    mineEmpty: '직접 만든 코치가 없습니다.',
    minChars: (n: number) => `최소 ${n}자`,
    add: '새 코치',
    name: '이름',
    role: '역할',
    rolePlaceholder: '예: 나는 면접관이다. 영어 면접 질문을 하나씩 하고 답을 고쳐 준다.',
    opening: '첫 메시지',
    openingPlaceholder: '코치가 처음 건넬 말',
    min: '최소 글자 수',
    save: '저장',
    remove: '삭제',
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
    review: '소감',
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
    change: '변경',
    changeNote: '변경은 내일부터 적용됩니다.',
    pending: (t: string, m: number) => `내일부터 ${t}, ${m}분`,
    shrink: (from: number, to: number) => `${from}분에서 ${to}분으로 줄이시겠습니까? 처음 약속은 ${from}분이었습니다.`,
    shrinkYes: '줄이기',
    save: '저장',
    saved: '저장됨',
    giveup: '포기',
    dev: '개발용 시간 이동',
  },

  error: {
    generic: '처리하지 못했습니다. 잠시 후 다시 시도해 주십시오.',
  },

  notify: {
    title: '그래고',
    pre: (m: number) => `30분 뒤 시작입니다. 오늘의 ${m}분을 준비하십시오.`,
    devil: [
      '오늘은 쉬셔도 됩니다. 원래 그러셨잖아요.',
      '아무것도 안 하던 때가 편하지 않으셨습니까?',
      '그만두고 싶으시죠. 옛날로 돌아가셔도 아무도 모릅니다.',
    ],
    noGoal: '다음 목표가 없습니다. 원래대로 돌아가시는 중입니다.',
  },
};

/** 독촉 문구. 재료를 돌려 같은 문장이 연속되지 않게 한다. */
export function nagLines(m: NagMaterial): string[] {
  const lines = [
    `오늘의 ${m.remainMinutes}분이 남았습니다. 아직 시작하지 않으셨습니다.`,
    '옛날처럼 아무것도 하지 않고 계시네요.',
    `'${quote(m.reason)}' 때문에 시작하셨습니다. 오늘은 그 이유가 없습니까?`,
    `하루 ${m.targetMinutes}분도 못 하시는 겁니까?`,
    m.totalMinutes > 0
      ? `지금까지 ${m.totalMinutes.toLocaleString()}분을 쌓으셨습니다. 오늘은 0분으로 끝내시겠습니까?`
      : `첫날부터 0분으로 끝내시겠습니까?`,
    '시간이 없다는 건 핑계입니다. 당신도 알고 저희도 압니다.',
  ];
  if (m.lastReview) lines.push(`지난번 '${quote(m.lastReview)}'라고 쓰셨습니다. 그 마음은 어디 가셨습니까?`);
  return lines;
}

/** 포기 대기 중 문구. 본인의 기록으로 긁는다. */
export function giveupLines(m: NagMaterial): string[] {
  const lines = [
    `처음에 '${quote(m.reason)}' 때문에 시작하셨습니다. 그 이유가 사라졌습니까? 겨우 그런 이유였습니까?`,
    `${m.days}일 동안 ${m.totalMinutes.toLocaleString()}분을 쌓으셨습니다. 그 시간을 버리시겠습니까?`,
    `목표는 '${quote(m.goalName)}'였습니다. 포기하면 옛날로 돌아갑니다.`,
    '아직 돌아올 수 있습니다. 철회 버튼 하나면 됩니다.',
  ];
  if (m.lastReview) lines.push(`'${quote(m.lastReview)}'라고 쓰셨던 날이 있습니다. 그때의 마음은 어디 갔습니까?`);
  return lines;
}
