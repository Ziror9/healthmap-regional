-- Fase 5.8: fluxo assistencial (municipio de residencia -> municipio de internacao).
--
-- Unica tabela do projeto que carrega os dois eixos na mesma linha, de forma
-- deliberada e rotulada (ver comentario do model em schema.prisma e
-- docs/fase-5.8-relatorio.md). Grao ANUAL: a supressao n<5 e decidida uma
-- unica vez sobre o total anual do par origem->destino (mesma licao do pivo
-- de grao da Fase 5.6).

CREATE TABLE "gold"."FatoFluxoInternacao" (
    "id" SERIAL NOT NULL,
    "municipioResidenciaId" INTEGER NOT NULL,
    "municipioInternacaoId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "grupoCidId" INTEGER NOT NULL,
    "internacoes" INTEGER,
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoFluxoInternacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FatoFluxoInternacao_ano_idx" ON "gold"."FatoFluxoInternacao"("ano");
CREATE INDEX "FatoFluxoInternacao_municipioResidenciaId_idx" ON "gold"."FatoFluxoInternacao"("municipioResidenciaId");
CREATE INDEX "FatoFluxoInternacao_municipioInternacaoId_idx" ON "gold"."FatoFluxoInternacao"("municipioInternacaoId");
CREATE INDEX "FatoFluxoInternacao_origem_idx" ON "gold"."FatoFluxoInternacao"("origem");

CREATE UNIQUE INDEX "FatoFluxoInternacao_municipioResidenciaId_municipioInternac_key"
    ON "gold"."FatoFluxoInternacao"("municipioResidenciaId", "municipioInternacaoId", "ano", "grupoCidId");

ALTER TABLE "gold"."FatoFluxoInternacao"
    ADD CONSTRAINT "FatoFluxoInternacao_municipioResidenciaId_fkey"
    FOREIGN KEY ("municipioResidenciaId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gold"."FatoFluxoInternacao"
    ADD CONSTRAINT "FatoFluxoInternacao_municipioInternacaoId_fkey"
    FOREIGN KEY ("municipioInternacaoId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gold"."FatoFluxoInternacao"
    ADD CONSTRAINT "FatoFluxoInternacao_grupoCidId_fkey"
    FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gold"."FatoFluxoInternacao"
    ADD CONSTRAINT "FatoFluxoInternacao_execucaoId_fkey"
    FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
