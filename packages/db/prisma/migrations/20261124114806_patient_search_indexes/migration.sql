-- Trigram indexes power prefix/contains search on 100k+ patients.
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- CreateIndex
CREATE INDEX "Patient_clinicId_phone2_idx" ON "Patient"("clinicId", "phone2");

-- CreateIndex
CREATE INDEX "patient_last_name_trgm" ON "Patient" USING GIN ("lastName" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "patient_first_name_trgm" ON "Patient" USING GIN ("firstName" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "patient_middle_name_trgm" ON "Patient" USING GIN ("middleName" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "patient_phone_trgm" ON "Patient" USING GIN ("phone" public.gin_trgm_ops);
