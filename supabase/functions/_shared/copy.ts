// 서버가 모델 없이 직접 쓰는 문장. 한국어는 합니다체(MP 7.6). 앱 문구(src/lib/copy.ts)와는 따로 둔다.

export const COACH_COPY = {
  /** lesson-turn: 한국어가 섞인 답에 모델 안내가 비었을 때 */
  notEnglish: '영어로 다시 답해 주십시오. 모르는 낱말은 쉬운 영어로 풀어 써도 됩니다.',
};

export const QUIZ_COPY = {
  wordRecall: (ko: string) => `뜻: ${ko}\n이 뜻의 영어 단어를 쓰십시오.`,
  expressionRecall: (ko: string) => `뜻: ${ko}\n이 뜻의 영어 표현을 쓰십시오.`,
  meaningChoice: (en: string) => `${en}\n이 말의 뜻을 고르십시오.`,
  situationWithItem: (partnerLine: string, ko: string) => `${partnerLine}\n\n'${ko}'에 해당하는 배운 말을 넣어 영어로 답하십시오.`,
  situationLevel: (partnerLine: string) => `${partnerLine}\n\n영어로 답하십시오.`,
  correct: '맞았습니다.',
  /** 정답 공개(두 번째 오답, 정답 보기) */
  wrong: (answerEn: string) => `정답은 "${answerEn}"입니다.`,
  /** 첫 오답. 정답을 보이지 않고 한 번 더 받는다. 설명 카드(모달)를 같이 줄 때만 "설명을 보거나" */
  retry: (withHint: boolean) => (withHint ? '틀렸습니다. 설명을 보거나 다시 답해 보십시오.' : '틀렸습니다. 다시 답해 보십시오.'),
  koreanRetry: '영어로 답해야 맞은 것으로 셉니다. 영어로 다시 답해 보십시오.',
  koreanAnswer: (answerEn: string) => `영어로 답해야 맞은 것으로 셉니다. 정답은 "${answerEn}"입니다.`,
};

// 회고 고정 질문(결정안 17). 영어. 순서대로 묻는다.
export const RETRO_Q1 = 'Use one new expression from today in a sentence.';
export const RETRO_Q2 = 'How was your day today?';
