import { isoWeekday, zonedToUtc } from '../../core/time.js';

export interface ScheduleRow {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  /** YYYY-MM-DD */
  validFrom: string;
  validTo: string | null;
}

export interface ExceptionRow {
  type: 'DAY_OFF' | 'CUSTOM_HOURS';
  startTime: string | null;
  endTime: string | null;
}

export interface Busy {
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  free: boolean;
}

interface Window {
  start: string;
  end: string;
  slotMinutes: number;
}

/** Working windows for a day: weekly template, replaced by an exception when one exists. */
export function workingWindows(
  day: string,
  schedules: ScheduleRow[],
  exception?: ExceptionRow,
): Window[] {
  const weekday = isoWeekday(day);
  const active = schedules.filter(
    (s) => s.weekday === weekday && s.validFrom <= day && (s.validTo === null || s.validTo >= day),
  );
  if (exception?.type === 'DAY_OFF') return [];
  if (exception?.type === 'CUSTOM_HOURS' && exception.startTime && exception.endTime) {
    return [
      {
        start: exception.startTime,
        end: exception.endTime,
        slotMinutes: active[0]?.slotMinutes ?? 20,
      },
    ];
  }
  return active.map((s) => ({ start: s.startTime, end: s.endTime, slotMinutes: s.slotMinutes }));
}

/** True if [startsAt, endsAt) lies fully inside one working window of that day. */
export function fitsWorkingHours(
  day: string,
  tz: string,
  windows: Window[],
  startsAt: Date,
  endsAt: Date,
): boolean {
  return windows.some(
    (w) => startsAt >= zonedToUtc(day, w.start, tz) && endsAt <= zonedToUtc(day, w.end, tz),
  );
}

/** Slots of a day in the branch time zone, each flagged free unless it overlaps a busy interval. */
export function computeSlots(
  day: string,
  tz: string,
  schedules: ScheduleRow[],
  exception: ExceptionRow | undefined,
  busy: Busy[],
): Slot[] {
  const slots: Slot[] = [];
  for (const w of workingWindows(day, schedules, exception)) {
    const end = zonedToUtc(day, w.end, tz);
    for (
      let t = zonedToUtc(day, w.start, tz);
      t.getTime() + w.slotMinutes * 60_000 <= end.getTime();
      t = new Date(t.getTime() + w.slotMinutes * 60_000)
    ) {
      const slotEnd = new Date(t.getTime() + w.slotMinutes * 60_000);
      slots.push({
        startsAt: t,
        endsAt: slotEnd,
        free: !busy.some((b) => b.startsAt < slotEnd && b.endsAt > t),
      });
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
