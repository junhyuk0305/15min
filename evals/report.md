# AI 학습 평가 보고서

**평가 미실행.** GEMINI_API_KEY가 환경에 없다. 실제 모델을 부르지 못해서 평가를 돌리지 않았다.

- 시각: 2026-10-18T01:05:46.158Z
- 합격 여부: 판정 없음. 이 상태로는 출시 기준(MP 7.1-2)을 통과했다고 볼 수 없다.
- 돌리는 법: `GEMINI_API_KEY=<키> npm run eval`. 모델을 바꾸려면 `AI_MODEL_MAIN`, `AI_MODEL_LIGHT`를 같이 넣는다.
- 하네스만 확인하려면 `AI_FAKE=1 npm run eval`. 결과는 `evals/report.selftest.md`에 따로 쓰고 품질 결과가 아니다.
