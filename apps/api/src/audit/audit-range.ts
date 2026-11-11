const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Cairo's UTC offset in minutes at an instant (Egypt observes DST again). */
function cairoOffsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((item) => item.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '');
  if (!match) return 120;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** The instant a Cairo calendar day starts (00:00 Africa/Cairo). */
export function startOfCairoDay(
  year: number,
  month: number,
  day: number,
): Date {
  const utc = Date.UTC(year, month - 1, day);
  const first = cairoOffsetMinutes(new Date(utc));
  let instant = utc - first * 60_000;
  const second = cairoOffsetMinutes(new Date(instant));
  if (second !== first) instant = utc - second * 60_000;
  return new Date(instant);
}

/**
 * Turns the query's `from` and `to` into a range. A bare date is a Cairo
 * calendar day: `from` starts it and `to` includes all of it.
 */
export function auditRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date; lte?: Date } {
  const range: { gte?: Date; lt?: Date; lte?: Date } = {};
  if (from) {
    const day = DAY.exec(from);
    const date = day
      ? startOfCairoDay(Number(day[1]), Number(day[2]), Number(day[3]))
      : new Date(from);
    if (!Number.isNaN(date.getTime())) range.gte = date;
  }
  if (to) {
    const day = DAY.exec(to);
    if (day) {
      // Day arithmetic through UTC handles month and year ends.
      const next = new Date(
        Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + 1),
      );
      range.lt = startOfCairoDay(
        next.getUTCFullYear(),
        next.getUTCMonth() + 1,
        next.getUTCDate(),
      );
    } else {
      const date = new Date(to);
      if (!Number.isNaN(date.getTime())) range.lte = date;
    }
  }
  return range;
}
