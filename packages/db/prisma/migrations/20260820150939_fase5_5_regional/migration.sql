-- CreateTable
CREATE TABLE "gold"."FatoInternacaoResidenciaRegional" (
    "id" SERIAL NOT NULL,
    "regiaoSaudeResidenciaId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "grupoCidId" INTEGER NOT NULL,
    "faixaEtaria" "gold"."FaixaEtaria" NOT NULL,
    "sexo" "gold"."Sexo" NOT NULL,
    "internacoes" INTEGER,
    "obitos" INTEGER,
    "diasPermanencia" INTEGER,
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoInternacaoResidenciaRegional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."FatoInternacaoLocalRegional" (
    "id" SERIAL NOT NULL,
    "regiaoSaudeInternacaoId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "grupoCidId" INTEGER NOT NULL,
    "faixaEtaria" "gold"."FaixaEtaria" NOT NULL,
    "sexo" "gold"."Sexo" NOT NULL,
    "internacoes" INTEGER,
    "pacientesDia" INTEGER,
    "diariasUti" INTEGER,
    "obitos" INTEGER,
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoInternacaoLocalRegional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."FatoCapacidadeLeitosRegional" (
    "id" SERIAL NOT NULL,
    "regiaoSaudeInternacaoId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "tipoLeito" "gold"."TipoLeito" NOT NULL,
    "leitosSus" INTEGER NOT NULL,
    "leitosTotais" INTEGER NOT NULL,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoCapacidadeLeitosRegional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."RiskComponenteValorRegional" (
    "id" SERIAL NOT NULL,
    "regiaoSaudeId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "riskConfigId" INTEGER NOT NULL,
    "componente" "meta"."ComponenteRisco" NOT NULL,
    "valorBruto" DECIMAL(14,4),
    "valorNormalizado" DECIMAL(5,4),
    "natureza" "meta"."Natureza" NOT NULL,
    "confiabilidade" "gold"."Confiabilidade" NOT NULL,
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "origem" "gold"."Origem" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskComponenteValorRegional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."RiskScoreRegional" (
    "id" SERIAL NOT NULL,
    "regiaoSaudeId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "riskConfigId" INTEGER NOT NULL,
    "indice" DECIMAL(5,4) NOT NULL,
    "classificacao" "gold"."ClassificacaoRisco" NOT NULL,
    "confiabilidade" "gold"."Confiabilidade" NOT NULL,
    "natureza" "meta"."Natureza" NOT NULL,
    "origem" "gold"."Origem" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskScoreRegional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FatoInternacaoResidenciaRegional_competenciaId_idx" ON "gold"."FatoInternacaoResidenciaRegional"("competenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoInternacaoResidenciaRegional_regiaoSaudeResidenciaId_co_key" ON "gold"."FatoInternacaoResidenciaRegional"("regiaoSaudeResidenciaId", "competenciaId", "grupoCidId", "faixaEtaria", "sexo");

-- CreateIndex
CREATE INDEX "FatoInternacaoLocalRegional_competenciaId_idx" ON "gold"."FatoInternacaoLocalRegional"("competenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoInternacaoLocalRegional_regiaoSaudeInternacaoId_compete_key" ON "gold"."FatoInternacaoLocalRegional"("regiaoSaudeInternacaoId", "competenciaId", "grupoCidId", "faixaEtaria", "sexo");

-- CreateIndex
CREATE INDEX "FatoCapacidadeLeitosRegional_competenciaId_idx" ON "gold"."FatoCapacidadeLeitosRegional"("competenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoCapacidadeLeitosRegional_regiaoSaudeInternacaoId_compet_key" ON "gold"."FatoCapacidadeLeitosRegional"("regiaoSaudeInternacaoId", "competenciaId", "tipoLeito");

-- CreateIndex
CREATE UNIQUE INDEX "RiskComponenteValorRegional_regiaoSaudeId_competenciaId_ris_key" ON "gold"."RiskComponenteValorRegional"("regiaoSaudeId", "competenciaId", "riskConfigId", "componente");

-- CreateIndex
CREATE UNIQUE INDEX "RiskScoreRegional_regiaoSaudeId_competenciaId_riskConfigId_key" ON "gold"."RiskScoreRegional"("regiaoSaudeId", "competenciaId", "riskConfigId");

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidenciaRegional" ADD CONSTRAINT "FatoInternacaoResidenciaRegional_regiaoSaudeResidenciaId_fkey" FOREIGN KEY ("regiaoSaudeResidenciaId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidenciaRegional" ADD CONSTRAINT "FatoInternacaoResidenciaRegional_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidenciaRegional" ADD CONSTRAINT "FatoInternacaoResidenciaRegional_grupoCidId_fkey" FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidenciaRegional" ADD CONSTRAINT "FatoInternacaoResidenciaRegional_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocalRegional" ADD CONSTRAINT "FatoInternacaoLocalRegional_regiaoSaudeInternacaoId_fkey" FOREIGN KEY ("regiaoSaudeInternacaoId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocalRegional" ADD CONSTRAINT "FatoInternacaoLocalRegional_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocalRegional" ADD CONSTRAINT "FatoInternacaoLocalRegional_grupoCidId_fkey" FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocalRegional" ADD CONSTRAINT "FatoInternacaoLocalRegional_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoCapacidadeLeitosRegional" ADD CONSTRAINT "FatoCapacidadeLeitosRegional_regiaoSaudeInternacaoId_fkey" FOREIGN KEY ("regiaoSaudeInternacaoId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoCapacidadeLeitosRegional" ADD CONSTRAINT "FatoCapacidadeLeitosRegional_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoCapacidadeLeitosRegional" ADD CONSTRAINT "FatoCapacidadeLeitosRegional_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskComponenteValorRegional" ADD CONSTRAINT "RiskComponenteValorRegional_regiaoSaudeId_fkey" FOREIGN KEY ("regiaoSaudeId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskComponenteValorRegional" ADD CONSTRAINT "RiskComponenteValorRegional_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskComponenteValorRegional" ADD CONSTRAINT "RiskComponenteValorRegional_riskConfigId_fkey" FOREIGN KEY ("riskConfigId") REFERENCES "meta"."RiskConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskScoreRegional" ADD CONSTRAINT "RiskScoreRegional_regiaoSaudeId_fkey" FOREIGN KEY ("regiaoSaudeId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskScoreRegional" ADD CONSTRAINT "RiskScoreRegional_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskScoreRegional" ADD CONSTRAINT "RiskScoreRegional_riskConfigId_fkey" FOREIGN KEY ("riskConfigId") REFERENCES "meta"."RiskConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
