import type { Locale, LocalizedText } from '@app/shared';

/**
 * Sample course content used until the catalog API (M3) serves real levels.
 * Topics are illustrative; prices are intentionally absent until Mazen sets them.
 */

export type LessonState = 'done' | 'next' | 'locked' | 'preview';

export interface SampleLesson {
  id: string;
  title: LocalizedText;
  hanzi: string;
  minutes: number;
  state: LessonState;
}

export interface SampleLevel {
  slug: string;
  number: number;
  hanzi: string;
  title: LocalizedText;
  summary: LocalizedText;
  topics: LocalizedText[];
  priceMinor: number | null;
  lessons: SampleLesson[];
}

export function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}

export const sampleLevels: SampleLevel[] = [
  {
    slug: 'level-1',
    number: 1,
    hanzi: '入门',
    title: { ar: 'البداية', en: 'First steps', zh: '入门' },
    summary: {
      ar: 'النطق والنغمات الأربع، والتحية، والأرقام، وأول جملك.',
      en: 'Pinyin and the four tones, greetings, numbers, your first sentences.',
      zh: '拼音与四声、问候、数字和第一批句子。',
    },
    topics: [
      { ar: 'البينيين والنغمات', en: 'Pinyin & tones', zh: '拼音和声调' },
      { ar: 'التحية والتعارف', en: 'Greetings', zh: '问候' },
      { ar: 'الأرقام', en: 'Numbers', zh: '数字' },
    ],
    priceMinor: null,
    lessons: [
      {
        id: 'l1-1',
        title: { ar: 'النغمات الأربع', en: 'The four tones', zh: '四个声调' },
        hanzi: '声调',
        minutes: 12,
        state: 'done',
      },
      {
        id: 'l1-2',
        title: { ar: 'مرحباً: nǐ hǎo', en: 'Hello: nǐ hǎo', zh: '你好' },
        hanzi: '你好',
        minutes: 10,
        state: 'done',
      },
      {
        id: 'l1-3',
        title: { ar: 'العدّ من ١ إلى ١٠', en: 'Counting 1 to 10', zh: '一到十' },
        hanzi: '数字',
        minutes: 14,
        state: 'next',
      },
      {
        id: 'l1-4',
        title: { ar: 'أفراد العائلة', en: 'Family members', zh: '家人' },
        hanzi: '家人',
        minutes: 13,
        state: 'locked',
      },
      {
        id: 'l1-5',
        title: { ar: 'ما اسمك؟', en: 'What is your name?', zh: '你叫什么名字？' },
        hanzi: '名字',
        minutes: 11,
        state: 'locked',
      },
    ],
  },
  {
    slug: 'level-2',
    number: 2,
    hanzi: '日常',
    title: { ar: 'الحياة اليومية', en: 'Everyday life', zh: '日常生活' },
    summary: {
      ar: 'الوقت، والطعام، والتسوّق، والسؤال عن الطريق.',
      en: 'Time, food, shopping, asking the way.',
      zh: '时间、饮食、购物和问路。',
    },
    topics: [
      { ar: 'الوقت والمواعيد', en: 'Time', zh: '时间' },
      { ar: 'الطعام والمطعم', en: 'Food', zh: '饮食' },
      { ar: 'التسوّق', en: 'Shopping', zh: '购物' },
    ],
    priceMinor: null,
    lessons: [],
  },
  {
    slug: 'level-3',
    number: 3,
    hanzi: '交流',
    title: { ar: 'المحادثة', en: 'Conversation', zh: '交流' },
    summary: {
      ar: 'تتكلم عن نفسك وعملك وخططك بجمل أطول.',
      en: 'Talk about yourself, your work and your plans in longer sentences.',
      zh: '用更长的句子谈论自己、工作和计划。',
    },
    topics: [
      { ar: 'العمل والدراسة', en: 'Work & study', zh: '工作和学习' },
      { ar: 'السفر', en: 'Travel', zh: '旅行' },
      { ar: 'الخطط', en: 'Plans', zh: '计划' },
    ],
    priceMinor: null,
    lessons: [],
  },
  {
    slug: 'level-4',
    number: 4,
    hanzi: '流利',
    title: { ar: 'الطلاقة', en: 'Fluency', zh: '流利' },
    summary: {
      ar: 'القراءة والاستماع لمواقف حقيقية، والتعبير عن رأيك.',
      en: 'Reading and listening to real situations, giving your opinion.',
      zh: '阅读和听懂真实场景，表达自己的看法。',
    },
    topics: [
      { ar: 'القراءة', en: 'Reading', zh: '阅读' },
      { ar: 'الاستماع', en: 'Listening', zh: '听力' },
      { ar: 'إبداء الرأي', en: 'Opinions', zh: '表达看法' },
    ],
    priceMinor: null,
    lessons: [],
  },
];
