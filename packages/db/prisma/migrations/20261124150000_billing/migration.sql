-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'CLICK', 'PAYME', 'UZUM');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "encounterId" UUID,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "serviceId" UUID,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloat" BIGINT NOT NULL DEFAULT 0,
    "expectedCash" BIGINT,
    "countedCash" BIGINT,
    "difference" BIGINT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "refundedAmount" BIGINT NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "cashShiftId" UUID,
    "receivedByUserId" UUID NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "cashShiftId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_clinicId_patientId_idx" ON "Invoice"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "Invoice_clinicId_status_createdAt_idx" ON "Invoice"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_clinicId_number_key" ON "Invoice"("clinicId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_clinicId_idx" ON "InvoiceLine"("clinicId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "CashShift_clinicId_cashierId_status_idx" ON "CashShift"("clinicId", "cashierId", "status");

-- CreateIndex
CREATE INDEX "CashShift_clinicId_openedAt_idx" ON "CashShift"("clinicId", "openedAt");

-- CreateIndex
CREATE INDEX "Payment_clinicId_invoiceId_idx" ON "Payment"("clinicId", "invoiceId");

-- CreateIndex
CREATE INDEX "Payment_clinicId_cashShiftId_idx" ON "Payment"("clinicId", "cashShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_clinicId_idempotencyKey_key" ON "Payment"("clinicId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_clinicId_paymentId_idx" ON "Refund"("clinicId", "paymentId");

-- CreateIndex
CREATE INDEX "Refund_clinicId_cashShiftId_idx" ON "Refund"("clinicId", "cashShiftId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;


