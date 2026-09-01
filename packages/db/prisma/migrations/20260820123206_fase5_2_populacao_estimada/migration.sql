-- CreateTable
CREATE TABLE "gold"."PopulacaoEstimada" (
    "id" SERIAL NOT NULL,
    "municipioId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "populacaoTotal" INTEGER NOT NULL,
    "origem" "gold"."Origem" NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopulacaoEstimada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PopulacaoEstimada_municipioId_ano_key" ON "gold"."PopulacaoEstimada"("municipioId", "ano");

-- AddForeignKey
ALTER TABLE "gold"."PopulacaoEstimada" ADD CONSTRAINT "PopulacaoEstimada_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "silver"."Municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold"."PopulacaoEstimada" ADD CONSTRAINT "PopulacaoEstimada_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "meta"."IngestaoExecucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
