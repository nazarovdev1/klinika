-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('DATA_PROCESSING', 'DHP_SHARING', 'SMS');

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "birthDate" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "phone" TEXT NOT NULL,
    "phone2" TEXT,
    "address" TEXT,
    "pinflEnc" TEXT,
    "pinflHash" TEXT,
    "passportEnc" TEXT,
    "passportHash" TEXT,
    "notes" TEXT,
    "bloodGroup" TEXT,
    "allergiesText" TEXT,
    "dhpPatientId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "recordedByUserId" UUID,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_clinicId_passportHash_idx" ON "Patient"("clinicId", "passportHash");

-- CreateIndex
CREATE INDEX "Patient_clinicId_phone_idx" ON "Patient"("clinicId", "phone");

-- CreateIndex
CREATE INDEX "Patient_clinicId_lastName_firstName_idx" ON "Patient"("clinicId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Patient_clinicId_birthDate_idx" ON "Patient"("clinicId", "birthDate");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_pinflHash_key" ON "Patient"("clinicId", "pinflHash");

-- CreateIndex
CREATE INDEX "PatientConsent_clinicId_idx" ON "PatientConsent"("clinicId");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_type_idx" ON "PatientConsent"("patientId", "type");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
