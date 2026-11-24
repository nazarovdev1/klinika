-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED');

-- CreateTable
CREATE TABLE "PatientChannel" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "externalId" TEXT,
    "linkCode" TEXT,
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'uz',
    "params" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientChannel_clinicId_idx" ON "PatientChannel"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientChannel_patientId_channel_key" ON "PatientChannel"("patientId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PatientChannel_linkCode_key" ON "PatientChannel"("linkCode");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledFor_idx" ON "Notification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_clinicId_patientId_idx" ON "Notification"("clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_clinicId_dedupeKey_key" ON "Notification"("clinicId", "dedupeKey");


