import { describe, expect, it } from 'vitest';

import { parsePage, studentsHref, totalPages } from './students-paging';

describe('totalPages', () => {
  it('is at least one page and rounds up', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(20, 20)).toBe(1);
    expect(totalPages(21, 20)).toBe(2);
  });
});

describe('studentsHref', () => {
  it('omits defaults and encodes the query', () => {
    expect(studentsHref('ar', '', 1)).toBe('/ar/admin/students');
    expect(studentsHref('en', ' a b ', 3)).toBe(
      '/en/admin/students?query=a+b&page=3',
    );
    expect(studentsHref('zh', '', 2)).toBe('/zh/admin/students?page=2');
  });
});

describe('parsePage', () => {
  it('falls back to 1 for anything that is not a positive integer', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('2.5')).toBe(1);
    expect(parsePage('4')).toBe(4);
    expect(parsePage(['5', '6'])).toBe(5);
  });
});
