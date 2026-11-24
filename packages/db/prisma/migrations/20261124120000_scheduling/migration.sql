-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('FRONT_DESK', 'PHONE', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('DAY_OFF', 'CUSTOM_HOURS');

-- DropIndex
DROP INDEX "patient_first_name_trgm";

-- DropIndex
DROP INDEX "patient_last_name_trgm";

-- DropIndex
DROP INDEX "patient_middle_name_trgm";

-- DropIndex
DROP INDEX "patient_phone_trgm";

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "nameUz" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "categoryId" UUID,
    "code" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 20,
    "isLab" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dhpServiceCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePrice" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "price" BIGINT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorService" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSchedule" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 20,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "serviceId" UUID,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "source" "AppointmentSource" NOT NULL DEFAULT 'FRONT_DESK',
    "note" TEXT,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID,
    "appointmentId" UUID,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "calledAt" TIMESTAMP(3),
    "cabinet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCategory_clinicId_idx" ON "ServiceCategory"("clinicId");

-- CreateIndex
CREATE INDEX "Service_clinicId_idx" ON "Service"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_clinicId_code_key" ON "Service"("clinicId", "code");

-- CreateIndex
CREATE INDEX "ServicePrice_clinicId_idx" ON "ServicePrice"("clinicId");

-- CreateIndex
CREATE INDEX "ServicePrice_serviceId_branchId_validFrom_idx" ON "ServicePrice"("serviceId", "branchId", "validFrom");

-- CreateIndex
CREATE INDEX "DoctorService_clinicId_idx" ON "DoctorService"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorService_doctorId_serviceId_key" ON "DoctorService"("doctorId", "serviceId");

-- CreateIndex
CREATE INDEX "DoctorSchedule_clinicId_idx" ON "DoctorSchedule"("clinicId");

-- CreateIndex
CREATE INDEX "DoctorSchedule_doctorId_branchId_weekday_idx" ON "DoctorSchedule"("doctorId", "branchId", "weekday");

-- CreateIndex
CREATE INDEX "ScheduleException_clinicId_idx" ON "ScheduleException"("clinicId");

-- CreateIndex
CREATE INDEX "ScheduleException_doctorId_date_idx" ON "ScheduleException"("doctorId", "date");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startsAt_idx" ON "Appointment"("clinicId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_startsAt_idx" ON "Appointment"("doctorId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "QueueTicket_clinicId_idx" ON "QueueTicket"("clinicId");

-- CreateIndex
CREATE INDEX "QueueTicket_branchId_date_status_idx" ON "QueueTicket"("branchId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_branchId_date_number_key" ON "QueueTicket"("branchId", "date", "number");

-- CreateIndex
CREATE INDEX "patient_last_name_trgm" ON "Patient" USING GIN ("lastName" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "patient_first_name_trgm" ON "Patient" USING GIN ("firstName" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "patient_middle_name_trgm" ON "Patient" USING GIN ("middleName" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "patient_phone_trgm" ON "Patient" USING GIN ("phone" public.gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrice" ADD CONSTRAINT "ServicePrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorService" ADD CONSTRAINT "DoctorService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Double booking is impossible at the database level (409 SLOT_TAKEN in the API).
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA public;
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tsrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));
