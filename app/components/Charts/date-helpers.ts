/**
 * Local-timezone calendar math for the chart kit (heatmap grid, month labels,
 * week bands), built on Intl so no date library is needed (PLAN D1/D6).
 *
 * Day keys are `YYYY-MM-DD` strings, already bucketed to the viewer's local
 * day by the API (PLAN D4); parsing them with the Date(year, month, day)
 * constructor keeps all grid math in local time.
 */

const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;

export const parseDayKey = (dayKey: string): Date => {
  const [year = 0, month = 1, day = 1] = dayKey.split('-').map(Number);

  return new Date(year, month - 1, day);
};

export const toDayKey = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
};

const countDaysInclusive = (startDay: string, endDay: string): number =>
  Math.round(
    (parseDayKey(endDay).getTime() - parseDayKey(startDay).getTime()) /
      MILLISECONDS_PER_DAY
  ) + 1;

export const listDayKeysBetween = (
  startDay: string,
  endDay: string
): string[] => {
  const totalDays = countDaysInclusive(startDay, endDay);

  if (totalDays <= 0) {
    return [];
  }

  const start = parseDayKey(startDay);

  return Array.from({length: totalDays}, (unused, index) =>
    toDayKey(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    )
  );
};

export type WeekColumn = {
  /** Seven slots, Sunday-first; undefined pads partial leading/trailing weeks. */
  days: (string | undefined)[];
};

export const buildWeekGrid = (
  startDay: string,
  endDay: string
): WeekColumn[] => {
  const dayKeys = listDayKeysBetween(startDay, endDay);

  if (dayKeys.length === 0) {
    return [];
  }

  const startSlot = parseDayKey(startDay).getDay();
  const weekCount = Math.ceil((startSlot + dayKeys.length) / DAYS_PER_WEEK);
  const weeks: WeekColumn[] = Array.from({length: weekCount}, () => ({
    days: Array.from({length: DAYS_PER_WEEK}, () => undefined),
  }));

  for (const [index, dayKey] of dayKeys.entries()) {
    const gridIndex = startSlot + index;
    const week = weeks[Math.floor(gridIndex / DAYS_PER_WEEK)];

    week.days[gridIndex % DAYS_PER_WEEK] = dayKey;
  }

  return weeks;
};

export type MonthLabel = {
  label: string;
  weekIndex: number;
};

/**
 * One label per month, placed at the first week column whose earliest day
 * falls in that month. A label immediately followed (within one column) by
 * the next month's label is dropped: a partial leading month has no room.
 */
export const buildMonthLabels = (
  weeks: WeekColumn[],
  locale?: string
): MonthLabel[] => {
  const monthFormat = new Intl.DateTimeFormat(locale, {month: 'short'});
  const labels: MonthLabel[] = [];
  let previousMonth: number | undefined;

  for (const [weekIndex, week] of weeks.entries()) {
    const firstDay = week.days.find((day) => day !== undefined);

    if (firstDay !== undefined) {
      const date = parseDayKey(firstDay);
      const month = date.getMonth();

      if (month !== previousMonth) {
        const lastLabel = labels.at(-1);

        if (lastLabel && weekIndex - lastLabel.weekIndex < 2) {
          labels.pop();
        }

        labels.push({label: monthFormat.format(date), weekIndex});
        previousMonth = month;
      }
    }
  }

  return labels;
};

export const formatDayLabel = (dayKey: string, locale?: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseDayKey(dayKey));

export const formatWeekLabel = (weekKey: string, locale?: string): string =>
  new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'short'}).format(
    parseDayKey(weekKey)
  );

/** Sunday-first weekday names, for heatmap row labels. */
export const buildWeekdayLabels = (locale?: string): string[] => {
  const weekdayFormat = new Intl.DateTimeFormat(locale, {weekday: 'short'});

  // 2026-06-07 is a Sunday; any known Sunday anchors the sequence.
  const anchor = new Date(2026, 5, 7);

  return Array.from({length: DAYS_PER_WEEK}, (unused, index) =>
    weekdayFormat.format(
      new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + index
      )
    )
  );
};
