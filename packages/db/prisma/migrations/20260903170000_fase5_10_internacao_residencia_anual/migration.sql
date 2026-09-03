-- Fase 5.10: internacoes por municipio de residencia no ANO.
--
-- Agregado do dado BRUTO do SIH (etl/ingest_sih.py), antes de qualquer
-- supressao, com a regra n<5 decidida UMA vez sobre o total do ano. Nao
-- substitui FatoInternacaoResidencia (grao demografico, supressao por celula
-- fina) nem FatoFluxoInternacao (par origem->destino) - ver comentario do
-- model em schema.prisma e docs/fase-5.10-relatorio.md.

CREATE TABLE "gold"."FatoInternacaoResidenciaAnual" (
    "id" SERIAL NOT NULL,
    "municipioResidenciaId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "grupoCidId" INTEGER NOT NULL,
    "internacoes" INTEGER,
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoInternacaoResidenciaAnual_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FatoInternacaoResidenciaAnual_ano_idx" ON "gold"."FatoInternacaoResidenciaAnual"("ano");
CREATE INDEX "FatoInternacaoResidenciaAnual_origem_idx" ON "gold"."FatoInternacaoResidenciaAnual"("origem");

CREATE UNIQUE INDEX "FatoInternacaoResidenciaAnual_municipioResidenciaId_ano_grup_key"
    ON "gold"."FatoInternacaoResidenciaAnual"("municipioResidenciaId", "ano", "grupoCidId");

ALTER TABLE "gold"."FatoInternacaoResidenciaAnual"
    ADD CONSTRAINT "FatoInternacaoResidenciaAnual_municipioResidenciaId_fkey"
    FOREIGN KEY ("municipioResidenciaId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gold"."FatoInternacaoResidenciaAnual"
    ADD CONSTRAINT "FatoInternacaoResidenciaAnual_grupoCidId_fkey"
    FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gold"."FatoInternacaoResidenciaAnual"
    ADD CONSTRAINT "FatoInternacaoResidenciaAnual_execucaoId_fkey"
    FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
