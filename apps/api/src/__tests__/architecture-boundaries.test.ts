/**
 * Testes de fronteira arquitetural (Fase 3), pedidos explicitamente:
 *   - nenhuma query Prisma/SQL foi colocada diretamente em controller;
 *   - o frontend nao acessa o banco diretamente.
 *
 * Nao precisam de servidor nem de banco - so leem arquivos-fonte e checam
 * padroes proibidos. Nao substituem revisao de codigo, mas transformam a
 * regra em algo que quebra o build se for violado no futuro.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function listFilesRecursive(dir: string, extensoes: string[], ignorarDirs: string[]): string[] {
  const arquivos: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (ignorarDirs.includes(entrada)) continue;
    const caminho = join(dir, entrada);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      arquivos.push(...listFilesRecursive(caminho, extensoes, ignorarDirs));
    } else if (extensoes.some((ext) => entrada.endsWith(ext))) {
      arquivos.push(caminho);
    }
  }
  return arquivos;
}

const PADROES_PROIBIDOS_EM_CONTROLLER = [
  /PrismaClient/,
  /getPrismaClient/,
  /\$queryRaw/,
  /\$executeRaw/,
  /\bprisma\./,
  /\bSELECT\s+.+\bFROM\b/i,
];

const MODULOS_PROIBIDOS_NO_FRONTEND = ['@healthmap/db', '@prisma/client'];

/**
 * Extrai os especificadores de modulo de `import ... from 'X'`,
 * `import 'X'` e `require('X')`. So esses - nunca o arquivo inteiro -
 * porque um comentario que MENCIONA um pacote proibido (documentando a
 * regra, como este proprio arquivo faz) nao e uma violacao da regra.
 */
function extrairEspecificadoresDeImport(conteudo: string): string[] {
  const especificadores: string[] = [];
  const padroes = [/from\s+['"]([^'"]+)['"]/g, /require\(\s*['"]([^'"]+)['"]\s*\)/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const padrao of padroes) {
    for (const match of conteudo.matchAll(padrao)) {
      if (match[1]) especificadores.push(match[1]);
    }
  }
  return especificadores;
}

function importaModuloProibido(especificador: string, moduloProibido: string): boolean {
  return especificador === moduloProibido || especificador.startsWith(`${moduloProibido}/`);
}

describe('Fronteira arquitetural (Fase 3)', () => {
  it('nenhum controller de apps/api chama Prisma/SQL diretamente', () => {
    const controllersDir = join(process.cwd(), 'src', 'controllers');
    const arquivos = listFilesRecursive(controllersDir, ['.ts'], ['node_modules']);
    expect(arquivos.length).toBeGreaterThan(0);

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, 'utf-8');
      for (const padrao of PADROES_PROIBIDOS_EM_CONTROLLER) {
        expect(conteudo, `${arquivo} nao deve corresponder a ${padrao}`).not.toMatch(padrao);
      }
    }
  });

  it('apps/web nao importa @healthmap/db nem @prisma/client em nenhum arquivo-fonte', () => {
    const webDir = join(process.cwd(), '..', 'web');
    const arquivos = listFilesRecursive(webDir, ['.ts', '.tsx'], ['node_modules', '.next']);
    expect(arquivos.length).toBeGreaterThan(0);

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, 'utf-8');
      const especificadores = extrairEspecificadoresDeImport(conteudo);
      for (const moduloProibido of MODULOS_PROIBIDOS_NO_FRONTEND) {
        const violacao = especificadores.find((esp) => importaModuloProibido(esp, moduloProibido));
        expect(violacao, `${arquivo} nao deve importar ${moduloProibido}`).toBeUndefined();
      }
    }
  });
});
