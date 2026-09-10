/**
 * Snapshot do banco: gerar, restaurar e conferir.
 *
 * Uso, a partir da raiz do repositorio:
 *   npm run db:snapshot:create    gera data/snapshot/healthmap.dump + manifesto
 *   npm run db:snapshot:restore   restaura o dump num banco VAZIO e confere
 *   npm run db:snapshot:verify    confere o banco atual contra o manifesto
 *
 * Os tres aceitam `-- --banco <nome>` para operar em outro database do mesmo
 * container (usado para testar a restauracao sem tocar no banco `healthmap`).
 *
 * POR QUE UM SCRIPT, e nao comandos soltos no README: os comandos equivalentes
 * digitados a mao quebravam de tres jeitos diferentes no Windows, todos
 * reproduzidos ao escrever o guia de instalacao:
 *  - Git Bash reescreve `/tmp/...` (caminho DENTRO do container Linux) para
 *    `C:/Users/.../Temp/...` antes de chegar ao Docker - o pg_dump falha;
 *  - Windows PowerShell 5.1 corrompe o dump se ele for gerado com `>`
 *    (a saida nativa vira texto);
 *  - o PowerShell 5.1 remove as aspas dos nomes de tabela quando o SQL e
 *    passado como argumento para o psql.
 * Aqui o Docker e chamado como processo, com argumentos em lista - sem shell no
 * meio, nenhuma das tres transformacoes acontece. E a conferencia usa o Prisma,
 * nao o psql, entao nao ha SQL passando por linha de comando.
 *
 * O SQL deste arquivo vive em packages/db de proposito (CLAUDE.md, invariante 5).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

const RAIZ = resolve(process.cwd(), '../..');
config({ path: resolve(RAIZ, '.env') });

/** Nome fixo em docker-compose.yml (`container_name`). */
const CONTAINER = 'healthmap-postgres';
const USUARIO = process.env.POSTGRES_USER ?? 'healthmap';
const DIRETORIO = resolve(RAIZ, 'data', 'snapshot');
const ARQUIVO_DUMP = resolve(DIRETORIO, 'healthmap.dump');
const ARQUIVO_MANIFESTO = resolve(DIRETORIO, 'healthmap.manifest.json');
const CAMINHO_NO_CONTAINER = '/tmp/healthmap.dump';

interface Medidas {
  riskScoreRealLinhas: number;
  riskScoreRealChecksum: string | null;
  fluxoPares: number;
  fluxoInternacoes: number;
  municipios: number;
  migrationsAplicadas: number;
}

interface Manifesto {
  geradoEm: string;
  bancoDeOrigem: string;
  tamanhoBytes: number;
  medidas: Medidas;
}

function falhar(mensagem: string, dica?: string): never {
  console.error(`[snapshot] ${mensagem}`);
  if (dica) console.error(`[snapshot] ${dica}`);
  process.exit(1);
}

function bancoAlvo(): string {
  const indice = process.argv.indexOf('--banco');
  const banco = indice >= 0 ? process.argv[indice + 1] : (process.env.POSTGRES_DB ?? 'healthmap');
  // Vai como argumento para o Docker e dentro da URL de conexao: so aceita um
  // identificador simples, nunca algo que possa ser interpretado.
  if (!banco || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(banco)) falhar(`nome de banco invalido: "${banco ?? ''}"`);
  return banco;
}

/** Chama o Docker sem shell: argumentos chegam intactos em qualquer terminal. */
function docker(args: string[]): { ok: boolean; saida: string; erro: string } {
  const resultado = spawnSync('docker', args, { encoding: 'utf8' });
  if (resultado.error) {
    falhar(
      `nao foi possivel executar o Docker (${resultado.error.message}).`,
      'Confirme que o Docker Desktop esta instalado e aberto.',
    );
  }
  return { ok: resultado.status === 0, saida: resultado.stdout ?? '', erro: resultado.stderr ?? '' };
}

function exigirContainerSaudavel(): void {
  const { ok, saida, erro } = docker(['inspect', '-f', '{{.State.Health.Status}}', CONTAINER]);
  if (!ok) {
    falhar(
      `container ${CONTAINER} nao encontrado (${erro.trim().split('\n')[0]}).`,
      'Abra o Docker Desktop e rode: npm run db:up',
    );
  }
  if (saida.trim() !== 'healthy') {
    falhar(`container ${CONTAINER} ainda nao esta pronto (estado: ${saida.trim()}).`, 'Aguarde alguns segundos e tente de novo.');
  }
}

function clienteDoBanco(banco: string): PrismaClient {
  const base = process.env.DATABASE_URL;
  if (!base) falhar('DATABASE_URL nao definida.', 'Copie .env.example para .env (passo 2 do README).');
  const url = new URL(base);
  url.pathname = `/${banco}`;
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

async function medir(banco: string): Promise<Medidas> {
  const prisma = clienteDoBanco(banco);
  try {
    const [risk] = await prisma.$queryRaw<{ linhas: bigint; checksum: string | null }[]>`
      SELECT count(*) AS linhas, md5(string_agg(x, ',' ORDER BY x)) AS checksum
      FROM (
        SELECT "municipioId" || ':' || "competenciaId" || ':' || "riskConfigId" || ':' || indice || ':' || classificacao AS x
        FROM gold."RiskScore" WHERE origem = 'REAL'
      ) s`;
    const [fluxo] = await prisma.$queryRaw<{ pares: bigint; internacoes: bigint | null }[]>`
      SELECT count(*) AS pares, sum(internacoes) AS internacoes FROM gold."FatoFluxoInternacao"`;
    const [municipios] = await prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM silver."Municipio"`;
    const [migrations] = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL`;
    return {
      riskScoreRealLinhas: Number(risk?.linhas ?? 0),
      riskScoreRealChecksum: risk?.checksum ?? null,
      fluxoPares: Number(fluxo?.pares ?? 0),
      fluxoInternacoes: Number(fluxo?.internacoes ?? 0),
      municipios: Number(municipios?.total ?? 0),
      migrationsAplicadas: Number(migrations?.total ?? 0),
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** Quantas tabelas do dominio ja existem - 0 num banco recem-criado pelo docker compose. */
async function tabelasDoDominio(banco: string): Promise<number> {
  const prisma = clienteDoBanco(banco);
  try {
    const [linha] = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM information_schema.tables WHERE table_schema IN ('silver', 'gold', 'meta')`;
    return Number(linha?.total ?? 0);
  } finally {
    await prisma.$disconnect();
  }
}

const ROTULOS: Record<keyof Medidas, string> = {
  riskScoreRealLinhas: 'RiskScore REAL (linhas)',
  riskScoreRealChecksum: 'RiskScore REAL (checksum)',
  fluxoPares: 'Fluxo (pares)',
  fluxoInternacoes: 'Fluxo (internacoes)',
  municipios: 'Municipios',
  migrationsAplicadas: 'Migrations aplicadas',
};

function imprimirMedidas(medidas: Medidas): void {
  for (const chave of Object.keys(ROTULOS) as (keyof Medidas)[]) {
    console.info(`  ${ROTULOS[chave].padEnd(28)} ${String(medidas[chave])}`);
  }
}

async function criar(): Promise<void> {
  const banco = bancoAlvo();
  exigirContainerSaudavel();
  mkdirSync(DIRETORIO, { recursive: true });

  console.info(`[snapshot] gerando dump de "${banco}"...`);
  const dump = docker(['exec', CONTAINER, 'pg_dump', '-U', USUARIO, '-d', banco, '-Fc', '-f', CAMINHO_NO_CONTAINER]);
  if (!dump.ok) falhar(`pg_dump falhou: ${dump.erro.trim()}`);

  const copia = docker(['cp', `${CONTAINER}:${CAMINHO_NO_CONTAINER}`, ARQUIVO_DUMP]);
  docker(['exec', CONTAINER, 'rm', '-f', CAMINHO_NO_CONTAINER]);
  if (!copia.ok) falhar(`docker cp falhou: ${copia.erro.trim()}`);

  const manifesto: Manifesto = {
    geradoEm: new Date().toISOString(),
    bancoDeOrigem: banco,
    tamanhoBytes: statSync(ARQUIVO_DUMP).size,
    medidas: await medir(banco),
  };
  writeFileSync(ARQUIVO_MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');

  console.info(`[snapshot] gerado: data/snapshot/healthmap.dump (${(manifesto.tamanhoBytes / 1048576).toFixed(1)} MB)`);
  console.info('[snapshot] medidas gravadas em data/snapshot/healthmap.manifest.json:');
  imprimirMedidas(manifesto.medidas);
}

async function restaurar(): Promise<void> {
  const banco = bancoAlvo();
  if (!existsSync(ARQUIVO_DUMP)) {
    falhar('arquivo data/snapshot/healthmap.dump nao encontrado.', 'Gere na maquina de origem com: npm run db:snapshot:create');
  }
  exigirContainerSaudavel();

  // Procedimento testado: restaurar num banco VAZIO. Restaurar por cima de uma
  // base existente gera conflito de objetos - e melhor recusar com uma
  // instrucao clara do que deixar o pg_restore despejar dezenas de erros.
  const existentes = await tabelasDoDominio(banco);
  if (existentes > 0) {
    falhar(
      `o banco "${banco}" ja tem ${existentes} tabela(s) - a restauracao so e feita em banco vazio.`,
      'Para comecar do zero: npm run db:reset (APAGA os dados), npm run db:up, e rode esta restauracao de novo.',
    );
  }

  console.info(`[snapshot] restaurando em "${banco}"...`);
  const copia = docker(['cp', ARQUIVO_DUMP, `${CONTAINER}:${CAMINHO_NO_CONTAINER}`]);
  if (!copia.ok) falhar(`docker cp falhou: ${copia.erro.trim()}`);
  const restauracao = docker(['exec', CONTAINER, 'pg_restore', '-U', USUARIO, '-d', banco, '--no-owner', CAMINHO_NO_CONTAINER]);
  docker(['exec', CONTAINER, 'rm', '-f', CAMINHO_NO_CONTAINER]);
  if (!restauracao.ok) falhar(`pg_restore falhou: ${restauracao.erro.trim()}`);

  console.info('[snapshot] restaurado. Conferindo contra o manifesto...');
  await conferir();
}

async function conferir(): Promise<void> {
  const banco = bancoAlvo();
  const medidas = await medir(banco);

  if (!existsSync(ARQUIVO_MANIFESTO)) {
    console.info(`[snapshot] sem manifesto para comparar; medidas atuais de "${banco}":`);
    imprimirMedidas(medidas);
    return;
  }

  const manifesto = JSON.parse(readFileSync(ARQUIVO_MANIFESTO, 'utf8')) as Manifesto;
  let divergencias = 0;
  console.info(`[snapshot] "${banco}" comparado ao snapshot de ${manifesto.geradoEm}:`);
  for (const chave of Object.keys(ROTULOS) as (keyof Medidas)[]) {
    const esperado = manifesto.medidas[chave];
    const atual = medidas[chave];
    const igual = esperado === atual;
    if (!igual) divergencias += 1;
    console.info(`  ${igual ? 'OK ' : 'DIF'} ${ROTULOS[chave].padEnd(28)} ${String(atual)}${igual ? '' : `  (esperado ${String(esperado)})`}`);
  }

  if (divergencias > 0) {
    falhar(`${divergencias} medida(s) divergem do snapshot.`, 'O banco nao contem os mesmos dados do snapshot versionado.');
  }
  console.info('[snapshot] integridade confirmada: o banco e identico ao snapshot.');
}

const comando = process.argv[2];
const acoes: Record<string, () => Promise<void>> = { create: criar, restore: restaurar, verify: conferir };
const acao = comando ? acoes[comando] : undefined;
if (!acao) falhar(`comando desconhecido: "${comando ?? ''}". Use create, restore ou verify.`);

await acao();
