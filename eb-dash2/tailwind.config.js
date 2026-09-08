/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Empire semantic palette
        empire: {
          canvas:   'var(--empire-canvas)',
          surface:  'var(--empire-surface)',
          elevated: 'var(--empire-elevated)',
          hover:    'var(--empire-hover)',
          primary:  'var(--empire-primary)',
          'primary-hover': 'var(--empire-primary-hover)',
          'primary-foreground': 'var(--empire-primary-foreground)',
          void:     'var(--empire-void)',
          muted:    'var(--empire-muted)',
          subtle:   'var(--empire-subtle)',
          border:   'var(--empire-border)',
          'border-strong': 'var(--empire-border-strong)',
          success:  'var(--empire-success)',
          'success-soft': 'var(--empire-success-soft)',
          danger:   'var(--empire-danger)',
          'danger-soft': 'var(--empire-danger-soft)',
          warning:  'var(--empire-warning)',
          'warning-soft': 'var(--empire-warning-soft)',
          info:     'var(--empire-info)',
          'info-soft': 'var(--empire-info-soft)',
        },
        // shadcn compat
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        tertiary: "hsl(var(--tertiary))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
      },
      fontFamily: {
        display: ["'graphikMedium'", "Arial", "sans-serif"],
        sans:    ["'graphikMedium'", "Arial", "sans-serif"],
        body:    ["'graphikRegular'", "Arial", "sans-serif"],
        mono:    ["'graphikRegular'", "Arial", "Helvetica", "sans-serif"],
      },
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--empire-shadow-sm)',
        md: 'var(--empire-shadow-md)',
        lg: 'var(--empire-shadow-lg)',
        xl: 'var(--empire-shadow-xl)',
        glow: '0 0 0 1px rgba(130, 10, 209, 0.18), 0 4px 20px rgba(130, 10, 209, 0.10)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
