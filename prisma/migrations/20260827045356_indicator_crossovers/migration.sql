-- AlterTable
ALTER TABLE "Share" ADD COLUMN "bandwidth" REAL;
ALTER TABLE "Share" ADD COLUMN "bandwidthMin6m" REAL;
ALTER TABLE "Share" ADD COLUMN "crossAt" DATETIME;
ALTER TABLE "Share" ADD COLUMN "crossDirection" TEXT;
