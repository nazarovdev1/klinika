import { randomInt, randomUUID } from 'node:crypto';
import type { Db, Prisma, Role } from '@shifo/db';
import { hashPassword } from '../core/passwords.js';
import type { Pii } from '../core/pii.js';
import { seedIcd10 } from './icd10.js';
import { seedPatients } from './patients.js';

/**
 * Demo dataset: 8 doctors, 60 services, ~3 months of visits, invoices, payments, lab orders and cash shifts.
 * 100 % synthetic. Uses batched createMany so it also runs reasonably over a remote database.
 */
export interface DemoOptions {
  clinicName?: string;
  password: string;
  patients?: number;
  months?: number;
  /** Prefix for generated logins: `<prefix>.owner`, `<prefix>.doctor1` ... */
  loginPrefix?: string;
}

const SPECIALTIES = [
  'Terapevt',
  'Kardiolog',
  'Nevrolog',
  'Pediatr',
  'Ginekolog',
  'LOR',
  'Okulist',
  'Dermatolog',
] as const;
const CATEGORIES = [
  'Konsultatsiyalar',
  'Diagnostika',
  'Muolajalar',
  'Laboratoriya',
  'Ultratovush',
] as const;
const DX_CODES = [
  'J06.9',
  'I10',
  'K29.5',
  'M54.5',
  'E11.9',
  'J20.9',
  'N39.0',
  'G43.9',
  'L20.9',
  'H10.9',
];
const DRUGS = ['Paratsetamol', 'Ibuprofen', 'Amoksitsillin', 'Omeprazol', 'Loratadin', 'Metformin'];

const pick = <T>(a: readonly T[]): T => a[randomInt(a.length)] as T;
const chunk = <T>(a: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

async function insertAll<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
  size = 1500,
): Promise<void> {
  for (const batch of chunk(rows, size)) await insert(batch);
}

export async function seedDemo(
  db: Db,
  pii: Pii,
  opts: DemoOptions,
): Promise<{ clinicId: string; logins: string[] }> {
  const prisma = db.system();
  const name = opts.clinicName ?? 'Shifo Demo';
  const prefix = opts.loginPrefix ?? 'sd';
  if (await prisma.clinic.findFirst({ where: { name } })) {
    throw new Error(`Clinic "${name}" already exists; choose another --name or remove it first`);
  }
  await seedIcd10(db);
  const passwordHash = await hashPassword(opts.password);

  const clinic = await prisma.clinic.create({
    data: {
      name,
      legalName: `${name} MChJ`,
      address: 'Toshkent sh., Namuna ko‘chasi 1',
      phone: '+998712000000',
    },
  });
  const cid = clinic.id;
  const branch = await prisma.branch.create({
    data: {
      clinicId: cid,
      name: 'Asosiy filial',
      address: 'Toshkent sh., Namuna ko‘chasi 1',
      phone: '+998712000000',
    },
  });

  // ---- staff ------------------------------------------------------------------------------------
  const staffSpec = [
    { key: 'owner', role: 'OWNER', name: 'Demo Owner' },
    { key: 'admin', role: 'ADMIN', name: 'Demo Admin' },
    { key: 'registrar', role: 'REGISTRAR', name: 'Demo Registrator' },
    { key: 'cashier', role: 'CASHIER', name: 'Demo Kassir' },
    { key: 'nurse', role: 'NURSE', name: 'Demo Hamshira' },
    { key: 'lab', role: 'LAB', name: 'Demo Laborant' },
    ...SPECIALTIES.map((s, i) => ({
      key: `doctor${String(i + 1)}`,
      role: 'DOCTOR',
      name: `Dr. ${s} ${String(i + 1)}`,
    })),
  ] as { key: string; role: Role; name: string }[];
  const users = staffSpec.map((s, i) => ({
    id: randomUUID(),
    key: s.key,
    role: s.role,
    login: `${prefix}.${s.key}`,
    row: {
      clinicId: cid,
      fullName: s.name,
      phone: `+9989000${String(10000 + i)}`,
      login: `${prefix}.${s.key}`,
      passwordHash,
      role: s.role,
      mustChangePassword: false,
    },
  }));
  await prisma.user.createMany({ data: users.map((u) => ({ id: u.id, ...u.row })) });
  await prisma.userBranch.createMany({
    data: users.map((u) => ({ clinicId: cid, userId: u.id, branchId: branch.id })),
  });
  const doctors = users.filter((u) => u.role === 'DOCTOR');
  await prisma.doctorProfile.createMany({
    data: doctors.map((d, i) => ({
      clinicId: cid,
      userId: d.id,
      specialty: SPECIALTIES[i] ?? 'Terapevt',
      cabinet: String(101 + i),
      defaultSlotMinutes: 30,
    })),
  });
  const cashier = users.find((u) => u.key === 'cashier');
  const nurse = users.find((u) => u.key === 'nurse');
  if (!cashier || !nurse) throw new Error('seed misconfigured');

  const monday = new Date(Date.UTC(2020, 0, 6));
  await prisma.doctorSchedule.createMany({
    data: doctors.flatMap((d) =>
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        clinicId: cid,
        doctorId: d.id,
        branchId: branch.id,
        weekday,
        startTime: '09:00',
        endTime: weekday === 6 ? '13:00' : '17:00',
        slotMinutes: 30,
        validFrom: monday,
      })),
    ),
  });

  // ---- catalog: 60 services -------------------------------------------------------------------
  const cats = CATEGORIES.map((c) => ({ id: randomUUID(), nameUz: c, nameRu: c }));
  await prisma.serviceCategory.createMany({
    data: cats.map((c) => ({ id: c.id, clinicId: cid, nameUz: c.nameUz, nameRu: c.nameRu })),
  });
  const services = Array.from({ length: 60 }, (_, i) => {
    const cat = cats[i % cats.length];
    const isLab = cat?.nameUz === 'Laboratoriya';
    return {
      id: randomUUID(),
      clinicId: cid,
      categoryId: cat?.id ?? null,
      code: `SRV-${String(i + 1).padStart(3, '0')}`,
      nameUz:
        i < 8
          ? `${SPECIALTIES[i] ?? ''} konsultatsiyasi`
          : `${cat?.nameUz ?? 'Xizmat'} #${String(i + 1)}`,
      nameRu:
        i < 8
          ? `Консультация: ${SPECIALTIES[i] ?? ''}`
          : `${cat?.nameRu ?? 'Услуга'} №${String(i + 1)}`,
      durationMin: 30,
      isLab,
      price: BigInt((50 + (i % 20) * 15) * 1000),
    };
  });
  await prisma.service.createMany({
    data: services.map((s) => ({
      id: s.id,
      clinicId: s.clinicId,
      categoryId: s.categoryId,
      code: s.code,
      nameUz: s.nameUz,
      nameRu: s.nameRu,
      durationMin: s.durationMin,
      isLab: s.isLab,
    })),
  });
  await prisma.servicePrice.createMany({
    data: services.map((s) => ({
      clinicId: cid,
      serviceId: s.id,
      branchId: branch.id,
      price: s.price,
      validFrom: new Date(Date.UTC(2020, 0, 1)),
    })),
  });
  const consults = services.slice(0, 8);
  const extras = services.filter((s) => !s.isLab).slice(8);

  const labTests = [
    ['HGB', 'Gemoglobin', 'Гемоглобин', 'g/L', 120, 160, 70, 200],
    ['WBC', 'Leykotsitlar', 'Лейкоциты', '10^9/L', 4, 9, 2, 20],
    ['GLU', 'Glyukoza', 'Глюкоза', 'mmol/L', 3.9, 6.1, 2.2, 22],
    ['CHOL', 'Xolesterin', 'Холестерин', 'mmol/L', 3, 5.2, null, null],
    ['ALT', 'ALT', 'АЛТ', 'U/L', 0, 40, null, 400],
    ['CREA', 'Kreatinin', 'Креатинин', 'umol/L', 60, 110, null, 600],
  ] as const;
  await prisma.labTest.createMany({
    data: labTests.map(
      ([code, nameUz, nameRu, unit, refLow, refHigh, criticalLow, criticalHigh]) => ({
        clinicId: cid,
        code,
        nameUz,
        nameRu,
        unit,
        refLow,
        refHigh,
        criticalLow,
        criticalHigh,
      }),
    ),
  });

  // ---- patients ---------------------------------------------------------------------------------
  const patientCount = opts.patients ?? 400;
  await seedPatients(db, pii, cid, patientCount);
  const patientIds = (
    await prisma.patient.findMany({
      where: { clinicId: cid },
      select: { id: true },
      take: patientCount,
    })
  ).map((p) => p.id);

  // ---- 3 months of activity ---------------------------------------------------------------------
  const months = opts.months ?? 3;
  const today = new Date();
  const startDay = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  startDay.setUTCDate(startDay.getUTCDate() - months * 30);

  const appointments: Prisma.AppointmentCreateManyInput[] = [];
  const encounters: Prisma.EncounterCreateManyInput[] = [];
  const vitals: Prisma.VitalsCreateManyInput[] = [];
  const diagnoses: Prisma.DiagnosisCreateManyInput[] = [];
  const prescriptions: Prisma.PrescriptionCreateManyInput[] = [];
  const invoices: Prisma.InvoiceCreateManyInput[] = [];
  const lines: Prisma.InvoiceLineCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const shifts: Prisma.CashShiftCreateManyInput[] = [];
  const dxTitles = new Map(
    (await prisma.icd10Code.findMany({ where: { code: { in: DX_CODES } } })).map((c) => [
      c.code,
      c.titleUz,
    ]),
  );
  const yearSeq = new Map<string, number>();

  for (
    let day = new Date(startDay);
    day <= new Date(startDay.getTime() + (months * 30 + 7) * 86_400_000);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (weekday === 7) continue;
    const isPast =
      day < startDay ||
      day.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const slots = weekday === 6 ? 8 : 16; // 30-minute slots from 09:00 (UTC+5 -> 04:00Z)
    let cashInDay = 0n;
    for (const doc of doctors) {
      const booked = new Set<number>();
      const n = isPast ? 6 + randomInt(5) : 2 + randomInt(4);
      for (let k = 0; k < n; k++) {
        let slot = randomInt(slots);
        while (booked.has(slot)) slot = (slot + 1) % slots;
        booked.add(slot);
        const startsAt = new Date(day.getTime() + (4 * 60 + slot * 30) * 60_000);
        const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
        const patientId = pick(patientIds);
        const roll = randomInt(100);
        const status = !isPast
          ? 'BOOKED'
          : roll < 82
            ? 'COMPLETED'
            : roll < 92
              ? 'NO_SHOW'
              : 'CANCELLED';
        const appointmentId = randomUUID();
        appointments.push({
          id: appointmentId,
          clinicId: cid,
          branchId: branch.id,
          patientId,
          doctorId: doc.id,
          serviceId: consults[doctors.indexOf(doc)]?.id ?? null,
          startsAt,
          endsAt,
          status,
          createdByUserId: users.find((u) => u.key === 'registrar')?.id ?? null,
          createdAt: new Date(startsAt.getTime() - 3 * 86_400_000),
        });
        if (status !== 'COMPLETED') continue;

        const encId = randomUUID();
        const signedAt = new Date(endsAt.getTime() + 5 * 60_000);
        encounters.push({
          id: encId,
          clinicId: cid,
          branchId: branch.id,
          patientId,
          doctorId: doc.id,
          appointmentId,
          status: 'SIGNED',
          startedAt: startsAt,
          signedAt,
          complaints: 'Bosh og‘rig‘i, holsizlik (demo)',
          anamnesis: '3 kundan beri (demo)',
          objectiveStatus: 'Umumiy ahvol qoniqarli (demo)',
          conclusion: 'Demo xulosa',
          recommendations: 'Ko‘proq suyuqlik, dam olish (demo)',
          createdAt: startsAt,
        });
        vitals.push({
          clinicId: cid,
          encounterId: encId,
          temperature: 36 + randomInt(20) / 10,
          systolic: 105 + randomInt(35),
          diastolic: 65 + randomInt(25),
          pulse: 60 + randomInt(40),
          spo2: 94 + randomInt(6),
          recordedAt: startsAt,
          recordedByUserId: nurse.id,
        });
        const dx = pick(DX_CODES);
        diagnoses.push({
          clinicId: cid,
          encounterId: encId,
          icd10Code: dx,
          title: dxTitles.get(dx) ?? dx,
          type: 'PRIMARY',
        });
        prescriptions.push({
          clinicId: cid,
          encounterId: encId,
          drugName: pick(DRUGS),
          dosage: '500 mg',
          frequency: '3 mahal',
          durationDays: 5,
        });

        // invoice: the consultation + sometimes an extra service
        const lineSpecs = [
          consults[doctors.indexOf(doc)],
          ...(randomInt(100) < 40 ? [pick(extras)] : []),
        ].filter((s): s is (typeof services)[number] => s !== undefined);
        const total = lineSpecs.reduce((sum, s) => sum + s.price, 0n);
        const year = String(signedAt.getUTCFullYear());
        const seq = (yearSeq.get(year) ?? 0) + 1;
        yearSeq.set(year, seq);
        const invId = randomUUID();
        const payRoll = randomInt(100);
        const paid = payRoll < 80 ? total : payRoll < 90 ? total / 2n : 0n;
        invoices.push({
          id: invId,
          clinicId: cid,
          branchId: branch.id,
          patientId,
          encounterId: encId,
          number: `${year}-${branch.id.slice(0, 6).toUpperCase()}-${String(seq).padStart(6, '0')}`,
          status: paid === total ? 'PAID' : paid === 0n ? 'ISSUED' : 'PARTIAL',
          subtotal: total,
          total,
          paidAmount: paid,
          createdByUserId: cashier.id,
          issuedAt: signedAt,
          createdAt: signedAt,
        });
        for (const s of lineSpecs) {
          lines.push({
            clinicId: cid,
            invoiceId: invId,
            serviceId: s.id,
            description: s.nameUz,
            qty: 1,
            unitPrice: s.price,
            total: s.price,
          });
        }
        if (paid > 0n) {
          const method = pick(['CASH', 'CASH', 'CARD', 'CLICK'] as const);
          if (method === 'CASH') cashInDay += paid;
          payments.push({
            clinicId: cid,
            invoiceId: invId,
            method,
            amount: paid,
            idempotencyKey: `seed-${invId}`,
            receivedByUserId: cashier.id,
            createdAt: new Date(signedAt.getTime() + 10 * 60_000),
          });
        }
      }
    }
    if (isPast && cashInDay > 0n) {
      shifts.push({
        clinicId: cid,
        branchId: branch.id,
        cashierId: cashier.id,
        status: 'CLOSED',
        openingFloat: 100_000n,
        expectedCash: 100_000n + cashInDay,
        countedCash: 100_000n + cashInDay,
        difference: 0n,
        openedAt: new Date(day.getTime() + 4 * 3_600_000),
        closedAt: new Date(day.getTime() + 13 * 3_600_000),
      });
    }
  }

  await insertAll(appointments, (b) => prisma.appointment.createMany({ data: b }));
  await insertAll(encounters, (b) => prisma.encounter.createMany({ data: b }));
  await insertAll(vitals, (b) => prisma.vitals.createMany({ data: b }));
  await insertAll(diagnoses, (b) => prisma.diagnosis.createMany({ data: b }));
  await insertAll(prescriptions, (b) => prisma.prescription.createMany({ data: b }));
  await insertAll(invoices, (b) => prisma.invoice.createMany({ data: b }));
  await insertAll(lines, (b) => prisma.invoiceLine.createMany({ data: b }));
  await insertAll(payments, (b) => prisma.payment.createMany({ data: b }));
  await insertAll(shifts, (b) => prisma.cashShift.createMany({ data: b }));
  await prisma.numberSequence.createMany({
    data: [...yearSeq.entries()].map(([date, value]) => ({
      clinicId: cid,
      branchId: branch.id,
      key: 'invoice',
      date,
      value,
    })),
  });

  return { clinicId: cid, logins: users.map((u) => u.login) };
}
