import type { LocalizedText } from '@app/shared';

/**
 * Illustrative lessons for the landing page's "example path" section only.
 * This is sample content, labelled as such wherever it renders; real levels and
 * lessons always come from the catalog API.
 */

export type SamplePathState = 'done' | 'next' | 'locked' | 'preview';

export interface SamplePathLesson {
  id: string;
  title: LocalizedText;
  hanzi: string;
  minutes: number;
  state: SamplePathState;
}

export const samplePathLessons: SamplePathLesson[] = [
  {
    id: 'sample-1',
    title: { ar: 'النغمات الأربع', en: 'The four tones', zh: '四个声调' },
    hanzi: '声调',
    minutes: 12,
    state: 'done',
  },
  {
    id: 'sample-2',
    title: { ar: 'مرحباً: nǐ hǎo', en: 'Hello: nǐ hǎo', zh: '你好' },
    hanzi: '你好',
    minutes: 10,
    state: 'done',
  },
  {
    id: 'sample-3',
    title: { ar: 'العدّ من ١ إلى ١٠', en: 'Counting 1 to 10', zh: '一到十' },
    hanzi: '数字',
    minutes: 14,
    state: 'next',
  },
  {
    id: 'sample-4',
    title: { ar: 'أفراد العائلة', en: 'Family members', zh: '家人' },
    hanzi: '家人',
    minutes: 13,
    state: 'locked',
  },
  {
    id: 'sample-5',
    title: { ar: 'ما اسمك؟', en: 'What is your name?', zh: '你叫什么名字？' },
    hanzi: '名字',
    minutes: 11,
    state: 'locked',
  },
];
