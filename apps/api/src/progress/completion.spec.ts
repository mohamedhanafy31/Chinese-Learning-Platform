import {
  isLessonComplete,
  isVideoWatched,
  watchedPercent,
  type CompletionInput,
} from './completion';

const base: CompletionInput = {
  hasVideo: true,
  videoCovered: 100,
  duration: 100,
  quizzes: [],
};

describe('isVideoWatched', () => {
  const rows: [number, number, boolean][] = [
    [90, 100, true],
    [89, 100, false],
    [27, 30, true],
    [26, 30, false],
    [9, 10, true],
    [8, 10, false],
    [0, 0, false],
    [5, 0, false],
    [3, 3, true],
    [2, 3, false],
  ];
  it.each(rows)('covered %i of %i -> %s', (covered, duration, expected) => {
    expect(isVideoWatched(covered, duration)).toBe(expected);
  });
});

describe('watchedPercent', () => {
  it('floors and caps at 100', () => {
    expect(watchedPercent(89, 100)).toBe(89);
    expect(watchedPercent(1, 3)).toBe(33);
    expect(watchedPercent(200, 100)).toBe(100);
    expect(watchedPercent(5, 0)).toBe(0);
  });
});

describe('isLessonComplete', () => {
  const rows: [string, CompletionInput, boolean][] = [
    ['video only, watched', base, true],
    ['video only, 89 %', { ...base, videoCovered: 89 }, false],
    ['video only, 90 %', { ...base, videoCovered: 90 }, true],
    [
      'video only, rounding of a short clip (3 of 3)',
      { ...base, videoCovered: 3, duration: 3 },
      true,
    ],
    [
      'video only, rounding of a short clip (2 of 3)',
      { ...base, videoCovered: 2, duration: 3 },
      false,
    ],
    [
      'quizzes only, all passed',
      {
        hasVideo: false,
        videoCovered: 0,
        duration: 0,
        quizzes: [{ passed: true }, { passed: true }],
      },
      true,
    ],
    [
      'quizzes only, one missing',
      {
        hasVideo: false,
        videoCovered: 0,
        duration: 0,
        quizzes: [{ passed: true }, { passed: false }],
      },
      false,
    ],
    [
      'both, video watched and quiz passed',
      { ...base, quizzes: [{ passed: true }] },
      true,
    ],
    [
      'both, video watched but quiz not passed',
      { ...base, quizzes: [{ passed: false }] },
      false,
    ],
    [
      'both, quiz passed but video 89 %',
      { ...base, videoCovered: 89, quizzes: [{ passed: true }] },
      false,
    ],
    [
      'neither is complete by definition',
      { hasVideo: false, videoCovered: 0, duration: 0, quizzes: [] },
      true,
    ],
    [
      'a video of unknown length is never watched',
      { ...base, duration: 0 },
      false,
    ],
  ];
  it.each(rows)('%s', (_name, input, expected) => {
    expect(isLessonComplete(input)).toBe(expected);
  });
});
