import {
  FIRST_REPORT_SECONDS,
  applyReport,
  capRanges,
  clampRanges,
  coverage,
  limitCoverage,
  mergeRanges,
  parseRanges,
  subtractRanges,
  type Range,
} from './segments';

describe('mergeRanges', () => {
  const rows: [string, Range[], Range[]][] = [
    ['empty', [], []],
    ['single', [[1, 4]], [[1, 4]]],
    [
      'disjoint stay apart, sorted',
      [
        [10, 12],
        [1, 3],
      ],
      [
        [1, 3],
        [10, 12],
      ],
    ],
    [
      'overlapping merge',
      [
        [1, 5],
        [4, 9],
      ],
      [[1, 9]],
    ],
    [
      'touching merge',
      [
        [0, 5],
        [5, 8],
      ],
      [[0, 8]],
    ],
    [
      'contained is absorbed',
      [
        [0, 10],
        [2, 3],
      ],
      [[0, 10]],
    ],
    [
      'empty and inverted are dropped',
      [
        [3, 3],
        [5, 2],
      ],
      [],
    ],
    ['one decimal rounding', [[0.04, 1.26]], [[0, 1.3]]],
  ];
  it.each(rows)('%s', (_name, input, expected) => {
    expect(mergeRanges(input)).toEqual(expected);
  });
});

describe('coverage', () => {
  it('counts overlaps once', () => {
    expect(
      coverage([
        [0, 10],
        [5, 15],
        [20, 25],
      ]),
    ).toBe(20);
  });
  it('is zero for nothing', () => {
    expect(coverage([])).toBe(0);
  });
  it('keeps one decimal', () => {
    expect(
      coverage([
        [0, 0.1],
        [1, 1.2],
      ]),
    ).toBe(0.3);
  });
});

describe('clampRanges', () => {
  it('cuts to [0, duration] and drops what falls outside', () => {
    expect(
      clampRanges(
        [
          [-5, 3],
          [8, 14],
          [20, 30],
        ],
        10,
      ),
    ).toEqual([
      [0, 3],
      [8, 10],
    ]);
  });
});

describe('subtractRanges', () => {
  const rows: [string, Range[], Range[], Range[]][] = [
    ['nothing covered', [[0, 10]], [], [[0, 10]]],
    ['fully covered', [[2, 8]], [[0, 10]], []],
    [
      'middle covered',
      [[0, 10]],
      [[3, 6]],
      [
        [0, 3],
        [6, 10],
      ],
    ],
    ['edge covered', [[0, 10]], [[0, 4]], [[4, 10]]],
    [
      'several covered',
      [[0, 20]],
      [
        [2, 4],
        [10, 12],
      ],
      [
        [0, 2],
        [4, 10],
        [12, 20],
      ],
    ],
  ];
  it.each(rows)('%s', (_name, ranges, covered, expected) => {
    expect(subtractRanges(ranges, covered)).toEqual(expected);
  });
});

describe('limitCoverage', () => {
  it('cuts the range that crosses the budget', () => {
    expect(limitCoverage([[0, 100]], 15)).toEqual([[0, 15]]);
  });
  it('spends the budget front to back across ranges', () => {
    expect(
      limitCoverage(
        [
          [0, 10],
          [20, 40],
        ],
        15,
      ),
    ).toEqual([
      [0, 10],
      [20, 25],
    ]);
  });
  it('keeps nothing without budget', () => {
    expect(limitCoverage([[0, 10]], 0)).toEqual([]);
  });
});

describe('capRanges', () => {
  it('drops the shortest ranges instead of filling gaps', () => {
    const ranges: Range[] = [
      [0, 10],
      [20, 21],
      [30, 40],
    ];
    expect(capRanges(ranges, 2)).toEqual([
      [0, 10],
      [30, 40],
    ]);
  });
});

describe('parseRanges', () => {
  it('ignores malformed stored values', () => {
    expect(parseRanges('nope')).toEqual([]);
    expect(parseRanges([[1, 2], 'x', [3], [4, 'y'], [5, 7]])).toEqual([
      [1, 2],
      [5, 7],
    ]);
  });
});

describe('applyReport (anti-cheat)', () => {
  it('clamps a huge first report to 30 seconds', () => {
    const result = applyReport({
      stored: [],
      reported: [[0, 3000]],
      duration: 3000,
      sinceLastReportSec: null,
    });
    expect(coverage(result)).toBe(FIRST_REPORT_SECONDS);
    expect(result).toEqual([[0, 30]]);
  });

  it('allows the elapsed time plus 15 seconds on a later report', () => {
    const result = applyReport({
      stored: [[0, 30]],
      reported: [[30, 500]],
      duration: 600,
      sinceLastReportSec: 10,
    });
    expect(coverage(result)).toBe(30 + 25);
  });

  it('does not let repeated overlapping reports add coverage', () => {
    let stored: Range[] = [];
    stored = applyReport({
      stored,
      reported: [[0, 10]],
      duration: 100,
      sinceLastReportSec: null,
    });
    for (let i = 0; i < 5; i += 1) {
      stored = applyReport({
        stored,
        reported: [
          [0, 10],
          [2, 8],
        ],
        duration: 100,
        sinceLastReportSec: 10,
      });
    }
    expect(stored).toEqual([[0, 10]]);
  });

  it('clamps to the duration and ignores what lies beyond', () => {
    const result = applyReport({
      stored: [],
      reported: [[8, 12]],
      duration: 10,
      sinceLastReportSec: null,
    });
    expect(result).toEqual([[8, 10]]);
  });

  it('caps the time credit at the video length', () => {
    const result = applyReport({
      stored: [],
      reported: [[0, 100]],
      duration: 40,
      sinceLastReportSec: 86_400,
    });
    expect(coverage(result)).toBe(40);
  });

  it('never credits a negative interval', () => {
    const result = applyReport({
      stored: [],
      reported: [[0, 100]],
      duration: 100,
      sinceLastReportSec: -50,
    });
    expect(coverage(result)).toBe(15);
  });

  it('bounds total coverage to twice the time since the first report', () => {
    // Report spam: 100 reports, each claiming fresh 15 s, 1 s apart.
    let stored: Range[] = [];
    for (let i = 0; i < 100; i += 1) {
      stored = applyReport({
        stored,
        reported: [[i * 15, i * 15 + 15]],
        duration: 3000,
        sinceLastReportSec: i === 0 ? null : 1,
        sinceFirstReportSec: i,
      });
    }
    // 99 s after the first report: at most 30 + 2 * 99 = 228 s.
    expect(coverage(stored)).toBeLessThanOrEqual(228);
  });

  it('does not slow a learner watching at normal speed', () => {
    let stored: Range[] = [];
    for (let i = 0; i < 30; i += 1) {
      stored = applyReport({
        stored,
        reported: [[i * 10, i * 10 + 10]],
        duration: 300,
        sinceLastReportSec: i === 0 ? null : 10,
        sinceFirstReportSec: i * 10,
      });
    }
    expect(coverage(stored)).toBe(300);
  });
});
