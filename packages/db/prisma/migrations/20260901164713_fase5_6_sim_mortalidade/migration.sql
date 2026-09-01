-- CreateTable
CREATE TABLE "gold"."FatoObitoResidencia" (
    "id" SERIAL NOT NULL,
    "municipioResidenciaId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "grupoCidId" INTEGER NOT NULL,
    "faixaEtaria" "gold"."FaixaEtaria" NOT NULL,
    "sexo" "gold"."Sexo" NOT NULL,
    "obitos" INTEGER,
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoObitoResidencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FatoObitoResidencia_competenciaId_idx" ON "gold"."FatoObitoResidencia"("competenciaId");

-- CreateIndex
CREATE INDEX "FatoObitoResidencia_origem_idx" ON "gold"."FatoObitoResidencia"("origem");

-- CreateIndex
CREATE INDEX "FatoObitoResidencia_execucaoId_idx" ON "gold"."FatoObitoResidencia"("execucaoId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoObitoResidencia_municipioResidenciaId_competenciaId_gru_key" ON "gold"."FatoObitoResidencia"("municipioResidenciaId", "competenciaId", "grupoCidId", "faixaEtaria", "sexo");

-- AddForeignKey
ALTER TABLE "gold"."FatoObitoResidencia" ADD CONSTRAINT "FatoObitoResidencia_municipioResidenciaId_fkey" FOREIGN KEY ("municipioResidenciaId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoObitoResidencia" ADD CONSTRAINT "FatoObitoResidencia_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoObitoResidencia" ADD CONSTRAINT "FatoObitoResidencia_grupoCidId_fkey" FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoObitoResidencia" ADD CONSTRAINT "FatoObitoResidencia_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
