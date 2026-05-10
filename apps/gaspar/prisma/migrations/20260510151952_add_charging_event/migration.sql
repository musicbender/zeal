-- CreateTable
CREATE TABLE "charging_event" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "startAmps" INTEGER NOT NULL,
    "endAmps" INTEGER,
    "peakSolarKw" DOUBLE PRECISION,
    "energyKwh" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charging_event_pkey" PRIMARY KEY ("id")
);
