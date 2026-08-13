/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Packages internos do monorepo sao consumidos como codigo-fonte TypeScript.
  transpilePackages: ['@healthmap/contracts'],
  webpack: (config) => {
    // packages/contracts usa imports relativos com extensao .js (convencao
    // NodeNext/verbatimModuleSyntax do tsconfig raiz - cada arquivo .ts
    // importa o "proximo" .js que ele proprio vira ao compilar). tsx/vitest
    // resolvem isso nativamente; o webpack do Next nao, por padrao. So
    // apareceu agora porque ate a Fase 4 todo consumo de contracts em
    // apps/web era `import type` (apagado antes do bundling) - o primeiro
    // import de VALOR em runtime (ex.: enum Origem) expos a lacuna.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
