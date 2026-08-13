const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "mar/2026" a partir de ano+mes numericos. */
export function formatCompetenciaLabel(ano: number, mes: number): string {
  const nomeMes = MESES_ABREV[mes - 1] ?? String(mes).padStart(2, '0');
  return `${nomeMes}/${ano}`;
}

/** "mar/2026" a partir de uma dataRef ISO (YYYY-MM-DD) - formato devolvido por GET /api/competencias. */
export function formatDataRefLabel(dataRef: string): string {
  const [anoStr, mesStr] = dataRef.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  if (!ano || !mes) return dataRef;
  return formatCompetenciaLabel(ano, mes);
}

export function formatNumero(valor: number, casasDecimais = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  }).format(valor);
}

/** Indice do Radar (0-1) formatado com 2 casas, sempre no mesmo formato em toda a interface. */
export function formatIndice(valor: number): string {
  return valor.toFixed(2);
}
