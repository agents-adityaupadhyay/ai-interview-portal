import type { Config } from "tailwindcss";
import defaultColors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

// Theme tokens. Every colour family the pages use resolves to a CSS variable
// (`rgb(var(--c-gray-500) / <alpha-value>)`), so the existing `bg-gray-50`,
// `text-indigo-600`, ... classes pick up the brand palette and dark mode
// without touching each page. Background/border shades and text shades get
// separate variables because dark mode needs them to move in opposite
// directions (a `bg-red-50` chip turns into a dark tint while its
// `text-red-700` label turns light). `zinc` is left alone: the candidate
// interview room is designed dark with it.

type Scale = Record<string, string>;
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// Brand: a violet-leaning indigo ("iris"). 600 keeps >= 4.5:1 with white text.
const brand: Scale = {
  50: "#f3f2ff", 100: "#e9e7ff", 200: "#d5d1ff", 300: "#b6aeff", 400: "#9285fd",
  500: "#7361f8", 600: "#5f45ee", 700: "#5035d6", 800: "#432db0", 900: "#38298c", 950: "#221757",
};

// Warm, low-saturation neutrals (Linear's 2025 refresh moved off blue-grey for
// the same reason: chrome should recede and read as neutral, not tinted).
const grayLight: Scale = {
  50: "#fafaf9", 100: "#f4f4f2", 200: "#e7e6e3", 300: "#d6d4d0", 400: "#a3a09b",
  500: "#5f5c57", 600: "#4b4945", 700: "#3a3835", 800: "#262523", 900: "#171615", 950: "#0c0b0b",
};
// Inverted for dark mode: 50 is the page, 900 is the main text. Neutral
// near-black, not navy.
const grayDark: Scale = {
  50: "#0a0a0a", 100: "#161615", 200: "#252422", 300: "#33322f", 400: "#57554f",
  500: "#a19e98", 600: "#b9b6b0", 700: "#d3d1cc", 800: "#e8e6e2", 900: "#f5f4f2", 950: "#fcfcfb",
};
// Text-only overrides so "muted" grey copy still meets WCAG AA (4.5:1) on
// every surface it sits on (checked against white, 50 and 100).
const grayTextLight: Partial<Scale> = { 400: "#6b6863" };
const grayTextDark: Partial<Scale> = { 400: "#8f8c86" };

const SURFACE_LIGHT = "#ffffff";
const SURFACE_DARK = "#111110";

const CHROMATIC = ["indigo", "red", "green", "emerald", "amber", "yellow", "blue", "purple", "pink"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const channels = (hex: string) => hexToRgb(hex).join(" ");
function mix(fg: string, bg: string, amount: number) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  return a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount))).join(" ");
}

function paletteOf(name: string): Scale {
  return name === "indigo" ? brand : ((defaultColors as unknown as Record<string, Scale>)[name]);
}

function buildVars() {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  SHADES.forEach((s) => {
    light[`--c-gray-${s}`] = channels(grayLight[s]);
    dark[`--c-gray-${s}`] = channels(grayDark[s]);
    light[`--t-gray-${s}`] = channels(grayTextLight[s] || grayLight[s]);
    dark[`--t-gray-${s}`] = channels(grayTextDark[s] || grayDark[s]);
  });

  CHROMATIC.forEach((name) => {
    const p = paletteOf(name);
    SHADES.forEach((s) => {
      light[`--c-${name}-${s}`] = channels(p[s]);
      light[`--t-${name}-${s}`] = channels(p[s]);
    });
    // Dark: light tints become translucent-looking washes over the surface...
    dark[`--c-${name}-50`] = mix(p["500"], SURFACE_DARK, 0.12);
    dark[`--c-${name}-100`] = mix(p["500"], SURFACE_DARK, 0.2);
    dark[`--c-${name}-200`] = mix(p["500"], SURFACE_DARK, 0.32);
    dark[`--c-${name}-300`] = mix(p["500"], SURFACE_DARK, 0.48);
    ["400", "500", "600", "700", "800", "900", "950"].forEach((s) => {
      dark[`--c-${name}-${s}`] = channels(p[s]);
    });
    // ...and text shades flip toward the light end so labels stay readable.
    const textDark: Scale = {
      50: p["50"], 100: p["100"], 200: p["200"], 300: p["200"], 400: p["300"],
      500: p["300"], 600: p["300"], 700: p["200"], 800: p["100"], 900: p["50"], 950: p["50"],
    };
    SHADES.forEach((s) => {
      dark[`--t-${name}-${s}`] = channels(textDark[s]);
    });
  });

  light["--surface"] = channels(SURFACE_LIGHT);
  dark["--surface"] = channels(SURFACE_DARK);
  return { light, dark };
}

function tokenScale(prefix: "c" | "t", name: string): Scale {
  const out: Scale = {};
  SHADES.forEach((s) => {
    out[s] = `rgb(var(--${prefix}-${name}-${s}) / <alpha-value>)`;
  });
  return out;
}

const families = ["gray", ...CHROMATIC];
const bgColors: Record<string, Scale> = {};
const textColors: Record<string, Scale> = {};
families.forEach((f) => {
  bgColors[f] = tokenScale("c", f);
  textColors[f] = tokenScale("t", f);
});

const { light, dark } = buildVars();

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ...bgColors,
        primary: bgColors.indigo,
        dark: { 800: "#1e1e2e", 900: "#11111b", 950: "#0a0a14" },
      },
      textColor: { ...textColors, primary: textColors.indigo },
      // `bg-white` is a card surface; it goes dark with the theme. `text-white`
      // stays white because it sits on coloured buttons.
      backgroundColor: { white: "rgb(var(--surface) / <alpha-value>)" },
      ringOffsetColor: { white: "rgb(var(--surface) / <alpha-value>)" },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        // Vercel-style "shadow as border": a hairline ring plus a whisper of depth.
        hairline: "0 0 0 1px rgb(var(--c-gray-200)), 0 1px 2px rgb(0 0 0 / 0.04)",
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.05)",
        lift: "0 0 0 1px rgb(var(--c-gray-200)), 0 8px 24px -8px rgb(0 0 0 / 0.12)",
        glow: "0 0 0 1px rgb(var(--c-indigo-500) / 0.2), 0 8px 30px -6px rgb(var(--c-indigo-500) / 0.45)",
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...light, colorScheme: "light" },
        ".dark": { ...dark, colorScheme: "dark" },
        // The candidate interview room is designed dark on its own; keep its
        // greys on the original (light-mode) scale whatever the app theme is.
        ".dark .interview-room": { ...light, colorScheme: "dark" },
      });
    }),
  ],
};

export default config;
