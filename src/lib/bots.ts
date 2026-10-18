import { copy } from './copy';

export type Bot = {
  id: string;
  name: string;
  role: string;
  opening: string;
  minChars: number;
  builtin: boolean;
};

export const DEFAULT_MIN_CHARS = 100;

export const BUILTIN_BOTS: Bot[] = [
  {
    id: 'email',
    name: copy.bots.builtinNames.email,
    role: 'You are a strict business English coach. Give a realistic email task, then correct the user email line by line.',
    opening: 'Task: Your client delayed a payment by two weeks. Write a polite but firm email asking for payment by Friday.',
    minChars: DEFAULT_MIN_CHARS,
    builtin: true,
  },
  {
    id: 'freetalk',
    name: copy.bots.builtinNames.freetalk,
    role: 'You are a Silicon Valley engineer chatting casually. Ask one follow-up question at a time and fix unnatural phrases.',
    opening: "Hey! What did you work on today? Tell me about the hardest part.",
    minChars: DEFAULT_MIN_CHARS,
    builtin: true,
  },
  {
    id: 'summary',
    name: copy.bots.builtinNames.summary,
    role: 'You give a short tech news paragraph. The user summarizes it in three English sentences. You grade and rewrite.',
    opening:
      'Read and summarize in 3 sentences: "A startup released an open-source tool that lets small teams run language models on a single laptop. It cuts cloud costs but trades off speed. Early users report it works best for internal search."',
    minChars: DEFAULT_MIN_CHARS,
    builtin: true,
  },
  {
    id: 'vocab',
    name: copy.bots.builtinNames.vocab,
    role: 'You quiz one advanced word at a time. The user writes two sentences using it. You check usage.',
    opening: 'Word: "mitigate". Write two sentences using it, one about work and one about daily life.',
    minChars: DEFAULT_MIN_CHARS,
    builtin: true,
  },
];
