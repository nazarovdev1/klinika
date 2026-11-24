import { randomInt } from 'node:crypto';
import type { Db } from '@shifo/db';
import type { Pii } from '../core/pii.js';

const LAST = [
  'Karimov',
  'Rahimov',
  'Yusupov',
  'Abdullayev',
  'Tursunov',
  'Nazarov',
  'Ismoilov',
  'Ergashev',
  'Saidov',
  'Sobirov',
  'Mirzayev',
  'Hasanov',
  'Umarov',
  'Kamolov',
  'Qodirov',
  'Olimov',
  'Aliyev',
  'Normatov',
  'Xolmatov',
  'Jalilov',
  'Bekmurodov',
  'Davronov',
  'Rasulov',
  'Shokirov',
];
const FIRST_M = [
  'Aziz',
  'Sardor',
  'Bobur',
  'Jasur',
  'Dilshod',
  'Otabek',
  'Sherzod',
  'Akmal',
  'Rustam',
  'Farhod',
];
const FIRST_F = [
  'Malika',
  'Nilufar',
  'Dilnoza',
  'Madina',
  'Zarina',
  'Gulnora',
  'Feruza',
  'Shahnoza',
  'Sevara',
  'Kamola',
];
const PATRONYM_M = ['ovich', 'ovich'];
const PREFIX = ['90', '91', '93', '94', '95', '97', '98', '99', '88', '33'];

const pick = <T>(a: readonly T[]): T => a[randomInt(a.length)] as T;
const digits = (n: number): string => Array.from({ length: n }, () => randomInt(10)).join('');

/** Synthetic patients only (no real data). Returns the number of rows inserted. */
export async function seedPatients(
  db: Db,
  pii: Pii,
  clinicId: string,
  count: number,
  batchSize = 2000,
): Promise<number> {
  const prisma = db.system();
  let inserted = 0;
  const seenPinfl = new Set<string>();
  while (inserted < count) {
    const n = Math.min(batchSize, count - inserted);
    const data = Array.from({ length: n }, () => {
      const female = randomInt(2) === 1;
      const first = pick(female ? FIRST_F : FIRST_M);
      const year = 1940 + randomInt(80);
      const birthDate = new Date(Date.UTC(year, randomInt(12), 1 + randomInt(28)));
      let pinfl = digits(14);
      while (seenPinfl.has(pinfl)) pinfl = digits(14);
      seenPinfl.add(pinfl);
      const passport = `${pick(['AA', 'AB', 'AC', 'KA'])}${digits(7)}`;
      return {
        clinicId,
        lastName: pick(LAST) + (female ? 'a' : ''),
        firstName: first,
        middleName: `${pick(FIRST_M)}${female ? ' qizi' : ` ${pick(PATRONYM_M)}`}`.slice(0, 40),
        birthDate,
        sex: female ? ('FEMALE' as const) : ('MALE' as const),
        phone: `+998${pick(PREFIX)}${digits(7)}`,
        pinflEnc: pii.encrypt(pinfl),
        pinflHash: pii.hash(pinfl),
        passportEnc: pii.encrypt(passport),
        passportHash: pii.hash(passport),
      };
    });
    await prisma.patient.createMany({ data });
    inserted += n;
  }
  return inserted;
}
