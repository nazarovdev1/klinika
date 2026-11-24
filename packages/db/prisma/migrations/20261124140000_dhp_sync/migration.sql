-- CreateEnum
CREATE TYPE "DhpSyncStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED');

-- CreateTable
CREATE TABLE "DhpSyncRecord" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "outboxEventId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "status" "DhpSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "remoteId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhpSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DhpSyncRecord_outboxEventId_key" ON "DhpSyncRecord"("outboxEventId");

-- CreateIndex
CREATE INDEX "DhpSyncRecord_clinicId_status_idx" ON "DhpSyncRecord"("clinicId", "status");

-- CreateIndex
CREATE INDEX "DhpSyncRecord_clinicId_entityType_entityId_idx" ON "DhpSyncRecord"("clinicId", "entityType", "entityId");


