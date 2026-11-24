-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('OPEN', 'SIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY', 'COMPLICATION');

-- CreateTable
CREATE TABLE "Encounter" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "appointmentId" UUID,
    "status" "EncounterStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "complaints" TEXT,
    "anamnesis" TEXT,
    "objectiveStatus" TEXT,
    "conclusion" TEXT,
    "recommendations" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dhpEncounterId" TEXT,
    "dhpSyncStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vitals" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "temperature" DOUBLE PRECISION,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "respRate" INTEGER,
    "spo2" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "icd10Code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DiagnosisType" NOT NULL DEFAULT 'PRIMARY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Icd10Code" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "titleUz" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "parentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Icd10Code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "drugName" TEXT NOT NULL,
    "form" TEXT,
    "dosage" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterAddendum" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncounterAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextTemplate" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "specialty" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Encounter_clinicId_patientId_startedAt_idx" ON "Encounter"("clinicId", "patientId", "startedAt");

-- CreateIndex
CREATE INDEX "Encounter_clinicId_doctorId_startedAt_idx" ON "Encounter"("clinicId", "doctorId", "startedAt");

-- CreateIndex
CREATE INDEX "Vitals_clinicId_idx" ON "Vitals"("clinicId");

-- CreateIndex
CREATE INDEX "Vitals_encounterId_idx" ON "Vitals"("encounterId");

-- CreateIndex
CREATE INDEX "Diagnosis_clinicId_idx" ON "Diagnosis"("clinicId");

-- CreateIndex
CREATE INDEX "Diagnosis_encounterId_idx" ON "Diagnosis"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "Icd10Code_code_key" ON "Icd10Code"("code");

-- CreateIndex
CREATE INDEX "icd10_title_ru_trgm" ON "Icd10Code" USING GIN ("titleRu" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "icd10_title_uz_trgm" ON "Icd10Code" USING GIN ("titleUz" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Prescription_clinicId_idx" ON "Prescription"("clinicId");

-- CreateIndex
CREATE INDEX "Prescription_encounterId_idx" ON "Prescription"("encounterId");

-- CreateIndex
CREATE INDEX "EncounterAddendum_clinicId_idx" ON "EncounterAddendum"("clinicId");

-- CreateIndex
CREATE INDEX "EncounterAddendum_encounterId_idx" ON "EncounterAddendum"("encounterId");

-- CreateIndex
CREATE INDEX "Attachment_clinicId_entityType_entityId_idx" ON "Attachment"("clinicId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TextTemplate_clinicId_specialty_idx" ON "TextTemplate"("clinicId", "specialty");

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterAddendum" ADD CONSTRAINT "EncounterAddendum_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

