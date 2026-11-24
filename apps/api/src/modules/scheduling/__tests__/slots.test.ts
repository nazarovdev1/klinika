import { describe, expect, it } from 'vitest';
import { isoWeekday, zonedToUtc } from '../../../core/time.js';
import { computeSlots, fitsWorkingHours, workingWindows, type ScheduleRow } from '../slots.js';

const TZ = 'Asia/Tashkent'; // UTC+5, no DST
const monday = '2026-12-07'; // a Monday
const base: ScheduleRow = {
  weekday: 1,
  startTime: '09:00',
  endTime: '10:00',
  slotMinutes: 20,
  validFrom: '2026-01-01',
  validTo: null,
};

describe('time helpers', () => {
  it('converts Tashkent wall-clock time to UTC', () => {
    expect(zonedToUtc('2026-12-07', '09:00', TZ).toISOString()).toBe('2026-12-07T04:00:00.000Z');
  });
  it('computes ISO weekdays', () => {
    expect(isoWeekday('2026-12-07')).toBe(1);
    expect(isoWeekday('2026-12-13')).toBe(7);
  });
});

describe('computeSlots', () => {
  it('generates slots from the weekly template', () => {
    const slots = computeSlots(monday, TZ, [base], undefined, []);
    expect(slots).toHaveLength(3);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-12-07T04:00:00.000Z');
    expect(slots.every((s) => s.free)).toBe(true);
  });

  it('ignores other weekdays and schedules outside their validity', () => {
    expect(computeSlots('2026-12-08', TZ, [base], undefined, [])).toHaveLength(0);
    expect(
      computeSlots(monday, TZ, [{ ...base, validTo: '2026-11-30' }], undefined, []),
    ).toHaveLength(0);
    expect(
      computeSlots(monday, TZ, [{ ...base, validFrom: '2026-12-08' }], undefined, []),
    ).toHaveLength(0);
  });

  it('marks overlapping slots as busy', () => {
    const busy = [
      {
        startsAt: new Date('2026-12-07T04:20:00Z'),
        endsAt: new Date('2026-12-07T04:40:00Z'),
      },
    ];
    expect(computeSlots(monday, TZ, [base], undefined, busy).map((s) => s.free)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('a day-off exception removes all slots', () => {
    const slots = computeSlots(
      monday,
      TZ,
      [base],
      { type: 'DAY_OFF', startTime: null, endTime: null },
      [],
    );
    expect(slots).toEqual([]);
  });

  it('custom hours replace the template for that day', () => {
    const slots = computeSlots(
      monday,
      TZ,
      [base],
      { type: 'CUSTOM_HOURS', startTime: '14:00', endTime: '15:00' },
      [],
    );
    expect(slots).toHaveLength(3);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-12-07T09:00:00.000Z');
  });

  it('handles split shifts and drops a trailing partial slot', () => {
    const slots = computeSlots(
      monday,
      TZ,
      [
        { ...base, startTime: '09:00', endTime: '09:50' },
        { ...base, startTime: '14:00', endTime: '14:40' },
      ],
      undefined,
      [],
    );
    expect(slots).toHaveLength(4); // 09:00, 09:20 | 14:00, 14:20
  });
});

describe('fitsWorkingHours', () => {
  const windows = workingWindows(monday, [base]);
  it('accepts an interval inside the window and rejects one that sticks out', () => {
    const at = (h: string) => zonedToUtc(monday, h, TZ);
    expect(fitsWorkingHours(monday, TZ, windows, at('09:00'), at('09:20'))).toBe(true);
    expect(fitsWorkingHours(monday, TZ, windows, at('09:50'), at('10:10'))).toBe(false);
    expect(fitsWorkingHours(monday, TZ, windows, at('08:40'), at('09:00'))).toBe(false);
  });
});
