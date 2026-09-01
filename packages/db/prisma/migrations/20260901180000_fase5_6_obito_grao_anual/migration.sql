-- DropForeignKey
ALTER TABLE "gold"."FatoObitoResidencia" DROP CONSTRAINT "FatoObitoResidencia_competenciaId_fkey";

-- DropIndex
DROP INDEX "gold"."FatoObitoResidencia_competenciaId_idx";

-- DropIndex
DROP INDEX "gold"."FatoObitoResidencia_municipioResidenciaId_competenciaId_gru_key";

-- AlterTable
ALTER TABLE "gold"."FatoObitoResidencia" DROP COLUMN "competenciaId",
DROP COLUMN "faixaEtaria",
DROP COLUMN "sexo",
ADD COLUMN     "ano" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "FatoObitoResidencia_ano_idx" ON "gold"."FatoObitoResidencia"("ano");

-- CreateIndex
CREATE UNIQUE INDEX "FatoObitoResidencia_municipioResidenciaId_ano_grupoCidId_key" ON "gold"."FatoObitoResidencia"("municipioResidenciaId", "ano", "grupoCidId");
