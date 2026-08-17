'use client';

import type { MunicipioResumoDTO, RegiaoSaudeDTO } from '@healthmap/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, getMunicipios, getRegioes } from '@/lib/api';
import { inferOrigemMunicipio } from '@/lib/risk-display';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; municipios: MunicipioResumoDTO[]; regioes: RegiaoSaudeDTO[] };

export default function MunicipiosPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [busca, setBusca] = useState('');
  const [regiaoFiltro, setRegiaoFiltro] = useState<number | ''>('');

  useEffect(() => {
    let cancelado = false;
    Promise.all([getMunicipios({ pageSize: 200 }), getRegioes({ pageSize: 200 })])
      .then(([municipiosResp, regioesResp]) => {
        if (!cancelado) setEstado({ tipo: 'pronto', municipios: municipiosResp.data, regioes: regioesResp.data });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha desconhecida ao consultar a API.';
        setEstado({ tipo: 'erro', mensagem });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const municipiosFiltrados = useMemo(() => {
    if (estado.tipo !== 'pronto') return [];
    return estado.municipios.filter((municipio) => {
      const combinaBusca = busca.trim() === '' || municipio.nome.toLowerCase().includes(busca.trim().toLowerCase());
      const combinaRegiao = regiaoFiltro === '' || municipio.regiaoSaude.id === regiaoFiltro;
      return combinaBusca && combinaRegiao;
    });
  }, [estado, busca, regiaoFiltro]);

  return (
    <>
      <PageHeader
        title="Municípios"
        description="Catálogo geográfico monitorado pelo HealthMap Regional."
        actions={
          estado.tipo === 'pronto' ? (
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Buscar município..."
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Select
                value={regiaoFiltro}
                onChange={(evento) => setRegiaoFiltro(evento.target.value === '' ? '' : Number(evento.target.value))}
              >
                <option value="">Todas as regiões</option>
                {estado.regioes.map((regiao) => (
                  <option key={regiao.id} value={regiao.id}>
                    {regiao.nome}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />
      <PageContent>
        {estado.tipo === 'carregando' && <LoadingState label="Carregando municípios..." />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' &&
          (municipiosFiltrados.length === 0 ? (
            <EmptyState title="Nenhum município corresponde à busca." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Município</TableHead>
                  <TableHead>Código IBGE</TableHead>
                  <TableHead>Região de Saúde</TableHead>
                  <TableHead>UF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipiosFiltrados.map((municipio) => (
                  <TableRow key={municipio.id}>
                    <TableCell>
                      <Link
                        href={`/municipios/${municipio.id}`}
                        className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {municipio.nome}
                        <ProvenanceBadge origem={inferOrigemMunicipio(municipio.codigoIbge7)} />
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{municipio.codigoIbge7}</TableCell>
                    <TableCell className="text-muted-foreground">{municipio.regiaoSaude.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{municipio.uf}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
      </PageContent>
    </>
  );
}
