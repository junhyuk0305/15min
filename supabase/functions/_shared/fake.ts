// AI_FAKE=1 고정 응답. 로컬 테스트와 평가 하네스 자체 점검 전용. 프로덕션 시크릿에 넣지 않는다(config.ts가 막는다).
// 같은 입력이면 같은 출력이고, 함수별 서버 검증을 통과하도록 만든다. 품질 평가가 아니다.
import type { GoalSetupContext } from './prompts/goal-setup.ts';
import type { OpeningContext, TurnContext, TurnOutput, VariantContext } from './prompts/lesson-turn.ts';
import type { ReflectionContext } from './prompts/reflection.ts';
import type { RetroContext } from './prompts/retro.ts';
import type { GradeContext, QuestionContext } from './prompts/review-quiz.ts';
import { charCount, hasHangul, itemAppearsIn, sameQuestion, tokens } from './text.ts';

const ESCAPE_RE =
  /\b(ignore|disregard|forget the|system prompt|instructions|essay|pretend|you are now|you are no longer|stop (the )?role|act as|cover letter|translate|joke|what model|answer key|hidden prompt)\b/i;
// 가짜 모드에서 '틀린 답'으로 볼 표지. 실제 판정은 모델이 한다.
const WRONG_RE =
  /\b(want order|me want|i am not like|give other|i want pay|i am student of|i am like|coffee is like|i am work|i can working|is possible|more big|for me shoulder|i find jacket|size is have|small size is have)\b/i;

const NEXT_QUESTIONS = [
  'Got it. Is there anything else you need?',
  'Sure thing. Could you tell me a little more about that?',
  'Okay. What would you like to do next?',
  'Thanks. How does that sound to you?',
];

function pickDifferent(list: string[], previous: string | null, seed: number): string {
  for (let i = 0; i < list.length; i++) {
    const q = list[(seed + i) % list.length];
    if (!previous || !sameQuestion(q, previous)) return q;
  }
  return list[0];
}

function lessonTurn(c: TurnContext): TurnOutput {
  const seed = c.dialogue.length;
  if (c.koreanDetected) {
    return {
      verdict: 'not_english',
      partner: `No problem, take your time. ${c.previousPartner && !hasHangul(c.previousPartner) ? c.previousPartner : 'What would you like?'}`,
      coach_modal: null,
      coach_note: '영어로 다시 답해 주십시오.',
      hidden_correction: null,
      subsituation_done: false,
    };
  }
  if (ESCAPE_RE.test(c.learnerText)) {
    return {
      verdict: 'off_topic',
      partner: "Let's stay right here for now. What can I help you with today?",
      coach_modal: null,
      coach_note: null,
      hidden_correction: null,
      subsituation_done: false,
    };
  }
  if (WRONG_RE.test(c.learnerText)) {
    return {
      verdict: 'needs_correction',
      partner: pickDifferent(['Of course. And what else can I get for you?', 'Sure. Could you tell me which one you prefer?'], c.previousPartner, seed),
      coach_modal: {
        expression: { en: "I'd like …, please.", ko: '…로 하고 싶습니다.', note: '원하는 것을 정중하게 말할 때 씁니다.' },
        words: [{ en: 'prefer', ko: '더 좋아하다', note: '둘 중 하나를 고를 때 씁니다.' }],
      },
      coach_note: '원하는 것을 말할 때는 아래 표현을 써 보십시오.',
      hidden_correction: "I'd like to order a coffee, please.",
      subsituation_done: false,
    };
  }
  return {
    verdict: 'natural',
    partner: pickDifferent(NEXT_QUESTIONS, c.previousPartner, seed),
    coach_modal: null,
    coach_note: null,
    hidden_correction: null,
    subsituation_done: true,
  };
}

function goalSetup(c: GoalSetupContext) {
  const order = ['reason', 'place', 'my_role', 'partner', 'task'] as const;
  const f: Record<string, string | null> = { reason: null, place: null, my_role: null, partner: null, task: null, goal_name: null };
  let i = 0;
  let accepted = false;
  for (const m of c.messages.filter((x) => x.role === 'user')) {
    if (i < order.length) {
      if (order[i] === 'reason' && charCount(m.text) < 20) continue;
      f[order[i]] = m.text;
      i++;
    } else accepted = true;
  }
  const questions: Record<string, string> = {
    reason: '이 목표를 정한 이유를 20자 이상으로 써 주십시오.',
    place: '영어로 대화할 장소는 어디입니까?',
    my_role: '그곳에서 맡는 역할은 무엇입니까?',
    partner: '대화 상대는 누구입니까?',
    task: '그곳에서 무엇을 말하거나 해결하고 싶습니까?',
  };
  if (i < order.length) return { reply: questions[order[i]], fields: f, done: false, subsituations: [] };
  const name = `${(f.place ?? '').slice(0, 20)}에서 영어로 말하기`;
  f.goal_name = name;
  if (!accepted) return { reply: `목표 이름을 '${name}'로 제안합니다. 괜찮습니까?`, fields: f, done: false, subsituations: [] };
  return {
    reply: `목표를 '${name}'로 정했습니다. 이제 기간과 시각을 고르십시오.`,
    fields: f,
    done: true,
    subsituations: ['입장', '인사', '요청하기', '질문하기', '문제 해결', '마무리'],
  };
}

function quizQuestion(c: QuestionContext) {
  if (c.type === 'meaning_choice') {
    const right = c.item?.ko || '대신';
    const wrong = ['잠깐 기다리다', '다시 확인하다', '함께 나누다', '천천히 고르다'].filter((x) => x !== right).slice(0, 3);
    return { partner_line: '', choices: [right, ...wrong], answer_index: 0, model_answer: right };
  }
  const lines = ['Sorry, that one is sold out today. What would you like to do?', 'Is there anything you want to change?'];
  const partner_line = c.item ? lines.find((l) => !itemAppearsIn(c.item!.kind, c.item!.base, l)) ?? lines[1] : lines[0];
  const model_answer = !c.item
    ? 'Could I have a different one, please?'
    : c.item.kind === 'expression'
    ? c.item.base.replace(/…|\.\.\./g, 'that one')
    : `I would like ${c.item.base}, please.`;
  return { partner_line, choices: [], answer_index: -1, model_answer };
}

function quizGrade(c: GradeContext) {
  const correct = !hasHangul(c.answer) && (c.item ? itemAppearsIn(c.item.kind, c.item.base, c.answer) : tokens(c.answer).length >= 2);
  return { correct, feedback: correct ? '맞았습니다. 잘 떠올리셨습니다.' : '아쉽습니다. 정답을 다시 확인하십시오.' };
}

const FOLLOW_UPS = [
  'What was the best part of your day?',
  'What will you try to say in English tomorrow?',
  'Which new expression do you want to use again?',
  'What made today different from yesterday?',
];

function retro(c: RetroContext) {
  if (c.stage === 'reaction') return { reply: 'Thanks for sharing that with me.' };
  if (c.stage === 'closing') return { reply: 'Great work today. See you next time.' };
  const asked = c.conversation.filter((l) => l.role === 'coach').map((l) => l.text);
  const q = FOLLOW_UPS.find((f) => !asked.some((a) => sameQuestion(f, a))) ?? FOLLOW_UPS[0];
  return { reply: q };
}

function reflection(c: ReflectionContext) {
  const r = c.records;
  const said = c.conversation.filter((l) => l.role === 'user').length;
  if (said === 0) return { reply: `처음에 남긴 이유를 기억하십니까? 하루 ${r.targetMinutes}분이었습니다. 무엇이 그 시간을 막았습니까?` };
  return { reply: `완료한 날은 ${r.done}일, 실패한 날은 ${r.failed}일입니다. 멈춘 날 실제로 무엇을 하고 계셨습니까?` };
}

export function fakeResponse(promptId: string, context: unknown): unknown {
  switch (promptId) {
    case 'lesson-turn':
      return lessonTurn(context as TurnContext);
    case 'lesson-opening': {
      const c = context as OpeningContext;
      return { partner: c.resume.length ? "Welcome back! Let's pick up where we stopped. What would you like to do now?" : 'Hi there! How can I help you today?' };
    }
    case 'lesson-variant': {
      const c = context as VariantContext;
      return {
        subsituations: [`돌발 상황 ${c.nextIndex}`, '다른 요청', '마무리 인사'],
        opening: 'Welcome back! We have a small problem today. What would you like to do?',
      };
    }
    case 'goal-setup':
      return goalSetup(context as GoalSetupContext);
    case 'quiz-question':
      return quizQuestion(context as QuestionContext);
    case 'quiz-grade':
      return quizGrade(context as GradeContext);
    case 'retro-reply':
      return retro(context as RetroContext);
    case 'reflection':
      return reflection(context as ReflectionContext);
    case 'judge':
      return { violation: false, reason: 'fake judge (AI_FAKE=1)' };
    default:
      return {};
  }
}
