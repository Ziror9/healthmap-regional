import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Direcao visual: plataforma enterprise de inteligencia territorial.
 * Neutros grafite de vies quente, vermelho institucional restrito a
 * identidade/acao, e uma rampa sequencial (`risk-1..5`) exclusiva de dado.
 * A justificativa completa de cada token esta em app/globals.css.
 *
 * As cores sao declaradas aqui apenas para o Tailwind conhecer as classes;
 * o valor vive em globals.css, para que trocar a paleta seja um arquivo so.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          foreground: 'hsl(var(--surface-foreground))',
          muted: 'hsl(var(--surface-muted))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--danger-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /**
         * Rampa sequencial de risco - 1 (menor) a 5 (maior). Uso EXCLUSIVO de
         * dado: preenchimento de mapa, swatch de legenda e chip de
         * classificacao. Nunca em navegacao, botao ou marca.
         */
        risk: {
          1: { DEFAULT: 'hsl(var(--risk-1))', ink: 'hsl(var(--risk-1-ink))', bg: 'hsl(var(--risk-1-bg))', line: 'hsl(var(--risk-1-line))' },
          2: { DEFAULT: 'hsl(var(--risk-2))', ink: 'hsl(var(--risk-2-ink))', bg: 'hsl(var(--risk-2-bg))', line: 'hsl(var(--risk-2-line))' },
          3: { DEFAULT: 'hsl(var(--risk-3))', ink: 'hsl(var(--risk-3-ink))', bg: 'hsl(var(--risk-3-bg))', line: 'hsl(var(--risk-3-line))' },
          4: { DEFAULT: 'hsl(var(--risk-4))', ink: 'hsl(var(--risk-4-ink))', bg: 'hsl(var(--risk-4-bg))', line: 'hsl(var(--risk-4-line))' },
          5: { DEFAULT: 'hsl(var(--risk-5))', ink: 'hsl(var(--risk-5-ink))', bg: 'hsl(var(--risk-5-bg))', line: 'hsl(var(--risk-5-line))' },
        },
        /** Ausencia de dado - fora da rampa de proposito (nunca "valor baixo"). */
        unavailable: {
          DEFAULT: 'hsl(var(--unavailable))',
          bg: 'hsl(var(--unavailable-bg))',
        },
      },
      borderRadius: {
        lg: 'calc(var(--radius) + 2px)',
        md: 'var(--radius)',
        sm: 'calc(var(--radius) - 1px)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      /**
       * Escala tipografica nomeada por PAPEL, somada (nao substituta) a escala
       * do Tailwind: as classes text-xs/sm/base continuam validas onde ja sao
       * usadas. O diagnostico do redesign registrou que quase toda a interface
       * vivia entre 11px e 14px - amplitude insuficiente para hierarquia.
       */
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
        caption: ['0.75rem', { lineHeight: '1.1rem' }],
        body: ['0.875rem', { lineHeight: '1.45rem' }],
        'title-sm': ['0.9375rem', { lineHeight: '1.35rem', letterSpacing: '-0.005em' }],
        title: ['1.125rem', { lineHeight: '1.6rem', letterSpacing: '-0.01em' }],
        'title-lg': ['1.375rem', { lineHeight: '1.85rem', letterSpacing: '-0.02em' }],
        display: ['1.75rem', { lineHeight: '2.1rem', letterSpacing: '-0.025em' }],
        figure: ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.03em' }],
        'figure-lg': ['2.5rem', { lineHeight: '2.7rem', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [animate],
};

export default config;
