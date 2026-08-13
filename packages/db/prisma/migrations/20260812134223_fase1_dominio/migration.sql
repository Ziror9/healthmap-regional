-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "gold";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "meta";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "silver";

-- CreateEnum
CREATE TYPE "gold"."Origem" AS ENUM ('REAL', 'DEMO');

-- CreateEnum
CREATE TYPE "meta"."Natureza" AS ENUM ('OBSERVADO', 'ESTIMATIVA', 'PROJECAO');

-- CreateEnum
CREATE TYPE "meta"."EixoTerritorial" AS ENUM ('RESIDENCIA', 'INTERNACAO');

-- CreateEnum
CREATE TYPE "meta"."ComponenteRisco" AS ENUM ('PRESSAO_HOSPITALAR_ESTIMADA', 'TENDENCIA', 'SEVERIDADE', 'VULNERABILIDADE');

-- CreateEnum
CREATE TYPE "gold"."Sexo" AS ENUM ('MASCULINO', 'FEMININO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "gold"."FaixaEtaria" AS ENUM ('FX_00_09', 'FX_10_19', 'FX_20_29', 'FX_30_39', 'FX_40_49', 'FX_50_59', 'FX_60_69', 'FX_70_79', 'FX_80_MAIS');

-- CreateEnum
CREATE TYPE "gold"."TipoLeito" AS ENUM ('CLINICO', 'CIRURGICO', 'UTI', 'OUTRO');

-- CreateEnum
CREATE TYPE "gold"."ClassificacaoRisco" AS ENUM ('CRITICO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO');

-- CreateEnum
CREATE TYPE "gold"."Confiabilidade" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- CreateEnum
CREATE TYPE "meta"."IndicadorDirecao" AS ENUM ('MAIOR_PIOR', 'MENOR_PIOR');

-- CreateEnum
CREATE TYPE "meta"."ExecucaoStatus" AS ENUM ('INICIADA', 'SUCESSO', 'FALHA', 'PARCIAL');

-- CreateEnum
CREATE TYPE "meta"."SeveridadeCheck" AS ENUM ('BLOQUEANTE', 'ALERTA');

-- CreateEnum
CREATE TYPE "meta"."Perfil" AS ENUM ('ADMIN', 'GESTOR', 'LEITOR');

-- CreateEnum
CREATE TYPE "meta"."NivelEscopo" AS ENUM ('ESTADUAL', 'REGIONAL', 'MUNICIPAL');

-- CreateTable
CREATE TABLE "silver"."RegiaoSaude" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL DEFAULT 'SP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegiaoSaude_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "silver"."Municipio" (
    "id" SERIAL NOT NULL,
    "codigoIbge7" CHAR(7) NOT NULL,
    "codigoIbge6" CHAR(6) NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "regiaoSaudeId" INTEGER NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Municipio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "silver"."Competencia" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "dataRef" DATE NOT NULL,
    "diasNoMes" INTEGER NOT NULL,

    CONSTRAINT "Competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "silver"."GrupoCid" (
    "id" SERIAL NOT NULL,
    "codigoCidInicio" TEXT NOT NULL,
    "codigoCidFim" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "agrupamento" TEXT NOT NULL,
    "capitulo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GrupoCid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "silver"."Estabelecimento" (
    "id" SERIAL NOT NULL,
    "codigoCnes" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "habilitacaoOncologica" BOOLEAN NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estabelecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."FatoInternacaoResidencia" (
    "id" SERIAL NOT NULL,
    "municipioResidenciaId" INTEGER NOT NULL,
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

    CONSTRAINT "FatoInternacaoResidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."FatoInternacaoLocal" (
    "id" SERIAL NOT NULL,
    "municipioInternacaoId" INTEGER NOT NULL,
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

    CONSTRAINT "FatoInternacaoLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."FatoCapacidadeLeitos" (
    "id" SERIAL NOT NULL,
    "municipioInternacaoId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "tipoLeito" "gold"."TipoLeito" NOT NULL,
    "leitosSus" INTEGER NOT NULL,
    "leitosTotais" INTEGER NOT NULL,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatoCapacidadeLeitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."Populacao" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "faixaEtaria" "gold"."FaixaEtaria" NOT NULL,
    "sexo" "gold"."Sexo" NOT NULL,
    "populacao" INTEGER NOT NULL,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Populacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."IndicadorMunicipal" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "indicadorDefinicaoId" TEXT NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "denominador" DECIMAL(14,4),
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicadorMunicipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."RiskComponenteValor" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
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

    CONSTRAINT "RiskComponenteValor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold"."RiskScore" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "riskConfigId" INTEGER NOT NULL,
    "indice" DECIMAL(5,4) NOT NULL,
    "classificacao" "gold"."ClassificacaoRisco" NOT NULL,
    "confiabilidade" "gold"."Confiabilidade" NOT NULL,
    "natureza" "meta"."Natureza" NOT NULL,
    "origem" "gold"."Origem" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."IndicadorDefinicao" (
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "periodicidade" TEXT NOT NULL,
    "direcao" "meta"."IndicadorDirecao" NOT NULL,
    "eixoTerritorial" "meta"."EixoTerritorial" NOT NULL,
    "naturezaPadrao" "meta"."Natureza" NOT NULL,
    "notaMetodologica" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IndicadorDefinicao_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "meta"."RiskConfig" (
    "id" SERIAL NOT NULL,
    "metodoNormalizacao" TEXT NOT NULL,
    "limiarVolumeMinimo" INTEGER NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "oficial" BOOLEAN NOT NULL DEFAULT false,
    "autor" TEXT NOT NULL,
    "notaVersao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."RiskConfigComponente" (
    "id" SERIAL NOT NULL,
    "riskConfigId" INTEGER NOT NULL,
    "componente" "meta"."ComponenteRisco" NOT NULL,
    "peso" DECIMAL(5,4) NOT NULL,
    "indicadorDefinicaoId" TEXT,
    "parametros" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RiskConfigComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."FonteDados" (
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT,
    "licenca" TEXT,
    "periodicidade" TEXT NOT NULL,
    "defasagemEsperadaDias" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FonteDados_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "meta"."IngestaoExecucao" (
    "id" TEXT NOT NULL,
    "fonteDadosId" TEXT NOT NULL,
    "competenciaId" INTEGER,
    "status" "meta"."ExecucaoStatus" NOT NULL,
    "hashInsumos" TEXT,
    "versaoPipeline" TEXT NOT NULL,
    "linhasProcessadas" INTEGER,
    "linhasRejeitadas" INTEGER,
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "mensagemErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestaoExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."QualidadeCheck" (
    "id" TEXT NOT NULL,
    "ingestaoExecucaoId" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "severidade" "meta"."SeveridadeCheck" NOT NULL,
    "passou" BOOLEAN NOT NULL,
    "linhasAfetadas" INTEGER,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualidadeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."AuditLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "filtrosAplicados" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."PerfilAtribuicao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "perfil" "meta"."Perfil" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfilAtribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."EscopoTerritorial" (
    "id" TEXT NOT NULL,
    "perfilAtribuicaoId" TEXT NOT NULL,
    "nivel" "meta"."NivelEscopo" NOT NULL,
    "municipioId" INTEGER,
    "regiaoSaudeId" INTEGER,

    CONSTRAINT "EscopoTerritorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegiaoSaude_codigo_key" ON "silver"."RegiaoSaude"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Municipio_codigoIbge7_key" ON "silver"."Municipio"("codigoIbge7");

-- CreateIndex
CREATE UNIQUE INDEX "Municipio_codigoIbge6_key" ON "silver"."Municipio"("codigoIbge6");

-- CreateIndex
CREATE INDEX "Municipio_regiaoSaudeId_idx" ON "silver"."Municipio"("regiaoSaudeId");

-- CreateIndex
CREATE UNIQUE INDEX "Competencia_ano_mes_key" ON "silver"."Competencia"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "Competencia_dataRef_key" ON "silver"."Competencia"("dataRef");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoCid_codigoCidInicio_codigoCidFim_agrupamento_key" ON "silver"."GrupoCid"("codigoCidInicio", "codigoCidFim", "agrupamento");

-- CreateIndex
CREATE UNIQUE INDEX "Estabelecimento_codigoCnes_key" ON "silver"."Estabelecimento"("codigoCnes");

-- CreateIndex
CREATE INDEX "Estabelecimento_municipioId_idx" ON "silver"."Estabelecimento"("municipioId");

-- CreateIndex
CREATE INDEX "FatoInternacaoResidencia_competenciaId_idx" ON "gold"."FatoInternacaoResidencia"("competenciaId");

-- CreateIndex
CREATE INDEX "FatoInternacaoResidencia_origem_idx" ON "gold"."FatoInternacaoResidencia"("origem");

-- CreateIndex
CREATE INDEX "FatoInternacaoResidencia_execucaoId_idx" ON "gold"."FatoInternacaoResidencia"("execucaoId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoInternacaoResidencia_municipioResidenciaId_competenciaI_key" ON "gold"."FatoInternacaoResidencia"("municipioResidenciaId", "competenciaId", "grupoCidId", "faixaEtaria", "sexo");

-- CreateIndex
CREATE INDEX "FatoInternacaoLocal_competenciaId_idx" ON "gold"."FatoInternacaoLocal"("competenciaId");

-- CreateIndex
CREATE INDEX "FatoInternacaoLocal_origem_idx" ON "gold"."FatoInternacaoLocal"("origem");

-- CreateIndex
CREATE INDEX "FatoInternacaoLocal_execucaoId_idx" ON "gold"."FatoInternacaoLocal"("execucaoId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoInternacaoLocal_municipioInternacaoId_competenciaId_gru_key" ON "gold"."FatoInternacaoLocal"("municipioInternacaoId", "competenciaId", "grupoCidId", "faixaEtaria", "sexo");

-- CreateIndex
CREATE INDEX "FatoCapacidadeLeitos_competenciaId_idx" ON "gold"."FatoCapacidadeLeitos"("competenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "FatoCapacidadeLeitos_municipioInternacaoId_competenciaId_ti_key" ON "gold"."FatoCapacidadeLeitos"("municipioInternacaoId", "competenciaId", "tipoLeito");

-- CreateIndex
CREATE UNIQUE INDEX "Populacao_municipioId_ano_faixaEtaria_sexo_key" ON "gold"."Populacao"("municipioId", "ano", "faixaEtaria", "sexo");

-- CreateIndex
CREATE UNIQUE INDEX "IndicadorMunicipal_municipioId_ano_indicadorDefinicaoId_key" ON "gold"."IndicadorMunicipal"("municipioId", "ano", "indicadorDefinicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskComponenteValor_municipioId_competenciaId_riskConfigId__key" ON "gold"."RiskComponenteValor"("municipioId", "competenciaId", "riskConfigId", "componente");

-- CreateIndex
CREATE UNIQUE INDEX "RiskScore_municipioId_competenciaId_riskConfigId_key" ON "gold"."RiskScore"("municipioId", "competenciaId", "riskConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskConfigComponente_riskConfigId_componente_key" ON "meta"."RiskConfigComponente"("riskConfigId", "componente");

-- CreateIndex
CREATE INDEX "IngestaoExecucao_fonteDadosId_competenciaId_idx" ON "meta"."IngestaoExecucao"("fonteDadosId", "competenciaId");

-- CreateIndex
CREATE INDEX "IngestaoExecucao_status_idx" ON "meta"."IngestaoExecucao"("status");

-- CreateIndex
CREATE INDEX "QualidadeCheck_ingestaoExecucaoId_idx" ON "meta"."QualidadeCheck"("ingestaoExecucaoId");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_criadoEm_idx" ON "meta"."AuditLog"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "AuditLog_acao_idx" ON "meta"."AuditLog"("acao");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "meta"."Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilAtribuicao_usuarioId_perfil_key" ON "meta"."PerfilAtribuicao"("usuarioId", "perfil");

-- CreateIndex
CREATE INDEX "EscopoTerritorial_perfilAtribuicaoId_idx" ON "meta"."EscopoTerritorial"("perfilAtribuicaoId");

-- AddForeignKey
ALTER TABLE "silver"."Municipio" ADD CONSTRAINT "Municipio_regiaoSaudeId_fkey" FOREIGN KEY ("regiaoSaudeId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "silver"."Estabelecimento" ADD CONSTRAINT "Estabelecimento_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidencia" ADD CONSTRAINT "FatoInternacaoResidencia_municipioResidenciaId_fkey" FOREIGN KEY ("municipioResidenciaId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidencia" ADD CONSTRAINT "FatoInternacaoResidencia_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidencia" ADD CONSTRAINT "FatoInternacaoResidencia_grupoCidId_fkey" FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoResidencia" ADD CONSTRAINT "FatoInternacaoResidencia_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocal" ADD CONSTRAINT "FatoInternacaoLocal_municipioInternacaoId_fkey" FOREIGN KEY ("municipioInternacaoId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocal" ADD CONSTRAINT "FatoInternacaoLocal_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocal" ADD CONSTRAINT "FatoInternacaoLocal_grupoCidId_fkey" FOREIGN KEY ("grupoCidId") REFERENCES "silver"."GrupoCid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoInternacaoLocal" ADD CONSTRAINT "FatoInternacaoLocal_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoCapacidadeLeitos" ADD CONSTRAINT "FatoCapacidadeLeitos_municipioInternacaoId_fkey" FOREIGN KEY ("municipioInternacaoId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoCapacidadeLeitos" ADD CONSTRAINT "FatoCapacidadeLeitos_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."FatoCapacidadeLeitos" ADD CONSTRAINT "FatoCapacidadeLeitos_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."Populacao" ADD CONSTRAINT "Populacao_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."Populacao" ADD CONSTRAINT "Populacao_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."IndicadorMunicipal" ADD CONSTRAINT "IndicadorMunicipal_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."IndicadorMunicipal" ADD CONSTRAINT "IndicadorMunicipal_indicadorDefinicaoId_fkey" FOREIGN KEY ("indicadorDefinicaoId") REFERENCES "meta"."IndicadorDefinicao"("chave") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."IndicadorMunicipal" ADD CONSTRAINT "IndicadorMunicipal_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskComponenteValor" ADD CONSTRAINT "RiskComponenteValor_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskComponenteValor" ADD CONSTRAINT "RiskComponenteValor_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskComponenteValor" ADD CONSTRAINT "RiskComponenteValor_riskConfigId_fkey" FOREIGN KEY ("riskConfigId") REFERENCES "meta"."RiskConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskScore" ADD CONSTRAINT "RiskScore_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskScore" ADD CONSTRAINT "RiskScore_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."RiskScore" ADD CONSTRAINT "RiskScore_riskConfigId_fkey" FOREIGN KEY ("riskConfigId") REFERENCES "meta"."RiskConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."RiskConfigComponente" ADD CONSTRAINT "RiskConfigComponente_riskConfigId_fkey" FOREIGN KEY ("riskConfigId") REFERENCES "meta"."RiskConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."RiskConfigComponente" ADD CONSTRAINT "RiskConfigComponente_indicadorDefinicaoId_fkey" FOREIGN KEY ("indicadorDefinicaoId") REFERENCES "meta"."IndicadorDefinicao"("chave") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."IngestaoExecucao" ADD CONSTRAINT "IngestaoExecucao_fonteDadosId_fkey" FOREIGN KEY ("fonteDadosId") REFERENCES "meta"."FonteDados"("chave") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."IngestaoExecucao" ADD CONSTRAINT "IngestaoExecucao_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "silver"."Competencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."QualidadeCheck" ADD CONSTRAINT "QualidadeCheck_ingestaoExecucaoId_fkey" FOREIGN KEY ("ingestaoExecucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "meta"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."PerfilAtribuicao" ADD CONSTRAINT "PerfilAtribuicao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "meta"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."EscopoTerritorial" ADD CONSTRAINT "EscopoTerritorial_perfilAtribuicaoId_fkey" FOREIGN KEY ("perfilAtribuicaoId") REFERENCES "meta"."PerfilAtribuicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."EscopoTerritorial" ADD CONSTRAINT "EscopoTerritorial_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."EscopoTerritorial" ADD CONSTRAINT "EscopoTerritorial_regiaoSaudeId_fkey" FOREIGN KEY ("regiaoSaudeId") REFERENCES "silver"."RegiaoSaude"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Constraints adicionadas manualmente - nao expressaveis no DSL do Prisma.
-- Editadas neste arquivo antes da aplicacao (workflow suportado oficialmente
-- pelo Prisma para customizar migrations). Nao serao revertidas por
-- `prisma migrate dev` futuros, pois nao correspondem a nada declarado no
-- schema.prisma (logo, nenhum drift e detectado).
-- =============================================================================

-- CheckConstraint: Competencia.mes precisa ser um mes valido; diasNoMes
-- precisa caber num mes real (28-31).
ALTER TABLE "silver"."Competencia"
  ADD CONSTRAINT "Competencia_mes_check" CHECK ("mes" BETWEEN 1 AND 12),
  ADD CONSTRAINT "Competencia_diasNoMes_check" CHECK ("diasNoMes" BETWEEN 28 AND 31);

-- CheckConstraint: FatoInternacaoResidencia - supressao e medidas sensiveis
-- sao logicamente acopladas (suprimido=true <=> medidas NULL), e medidas
-- nunca sao negativas quando presentes.
ALTER TABLE "gold"."FatoInternacaoResidencia"
  ADD CONSTRAINT "FatoInternacaoResidencia_supressao_check" CHECK (
    ("suprimido" = false AND "internacoes" IS NOT NULL AND "obitos" IS NOT NULL AND "diasPermanencia" IS NOT NULL)
    OR
    ("suprimido" = true AND "internacoes" IS NULL AND "obitos" IS NULL AND "diasPermanencia" IS NULL)
  ),
  ADD CONSTRAINT "FatoInternacaoResidencia_naoNegativo_check" CHECK (
    ("internacoes" IS NULL OR "internacoes" >= 0)
    AND ("obitos" IS NULL OR "obitos" >= 0)
    AND ("diasPermanencia" IS NULL OR "diasPermanencia" >= 0)
  );

-- CheckConstraint: FatoInternacaoLocal - mesma logica do eixo residencia.
ALTER TABLE "gold"."FatoInternacaoLocal"
  ADD CONSTRAINT "FatoInternacaoLocal_supressao_check" CHECK (
    ("suprimido" = false AND "internacoes" IS NOT NULL AND "obitos" IS NOT NULL AND "pacientesDia" IS NOT NULL AND "diariasUti" IS NOT NULL)
    OR
    ("suprimido" = true AND "internacoes" IS NULL AND "obitos" IS NULL AND "pacientesDia" IS NULL AND "diariasUti" IS NULL)
  ),
  ADD CONSTRAINT "FatoInternacaoLocal_naoNegativo_check" CHECK (
    ("internacoes" IS NULL OR "internacoes" >= 0)
    AND ("obitos" IS NULL OR "obitos" >= 0)
    AND ("pacientesDia" IS NULL OR "pacientesDia" >= 0)
    AND ("diariasUti" IS NULL OR "diariasUti" >= 0)
  );

-- CheckConstraint: FatoCapacidadeLeitos - contagens de leitos nunca negativas.
ALTER TABLE "gold"."FatoCapacidadeLeitos"
  ADD CONSTRAINT "FatoCapacidadeLeitos_naoNegativo_check" CHECK ("leitosSus" >= 0 AND "leitosTotais" >= 0);

-- CheckConstraint: RiskConfigComponente.peso e uma fracao (0-1).
ALTER TABLE "meta"."RiskConfigComponente"
  ADD CONSTRAINT "RiskConfigComponente_peso_check" CHECK ("peso" >= 0 AND "peso" <= 1);

-- PartialUniqueIndex: no maximo uma RiskConfig oficial=true simultaneamente.
-- Nao expressavel como @@unique no DSL (indice parcial com WHERE).
CREATE UNIQUE INDEX "RiskConfig_oficial_unico"
  ON "meta"."RiskConfig" ("oficial")
  WHERE "oficial" = true;
