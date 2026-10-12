-- AlterTable
ALTER TABLE "Forecast" ADD COLUMN     "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
ALTER COLUMN "modelVersion" SET DEFAULT 'weighted-ma-v1';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "moq" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ReplenishmentRecommendation" ADD COLUMN     "forecastDemand" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "moq" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "planningHorizonDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "rawOrderQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "safetyStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockoutProbability" DECIMAL(6,4) NOT NULL DEFAULT 0;
