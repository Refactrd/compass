// Refactrd brand tokens — extracted by hand from the brand guideline PDF.
// This is Refactrd's real company brand, used ONLY in Phase 2 client-facing
// output (Opportunity Mapping PDFs, the Comprehensive Report). Never use
// these in Compass's own internal chat/admin UI — that has its own separate
// design system defined in CLAUDE.md.
//
// Color roles below follow the hierarchy as given in the guideline (Dark
// Blue first, down through Dark Azure last) — this is confirmed, not
// inferred.
//
// Typography: Codec Pro (the guideline's actual display font) is licensed
// and unavailable in this build environment. The guideline's own fallback
// for that case is a geometric sans with similar proportions, Poppins or
// Sora, not a collapse onto the body font, both are free Google Fonts and
// load the same way Compass's own fonts do via next/font/google. Poppins is
// used here as the primary choice; Sora is the documented alternate if a
// specific asset reads better with it. Montserrat is the body font, used
// directly since the guideline treats it as freely available already, not
// as a Codec Pro substitute.
//
// Logo assets: logo-light-bg.png (black wordmark, for white/Light Blue
// backgrounds) and logo-dark-bg.png (white/Light Azure wordmark, for Dark
// Blue or other dark backgrounds) live alongside this file. Always pick the
// variant matching the background; never recolor or reconstruct the mark.

export const refactrdBrand = {
  colors: {
    // Raw palette, named exactly as given in the guideline.
    raw: {
      darkBlue: "#1f2a44",
      lightAzure: "#a2d2ff",
      lightBlue: "#e6eaf0",
      white: "#fbfbfb",
      black: "#000000",
      darkAzure: "#0e5d7d",
    },
    // Semantic roles, following the stated hierarchy in order.
    primary: "#1f2a44", // Dark Blue — 1st in hierarchy
    secondary: "#a2d2ff", // Light Azure — 2nd
    tertiary: "#e6eaf0", // Light Blue — 3rd
    background: "#fbfbfb", // White — 4th
    text: "#000000", // Black — 5th
    accent: "#0e5d7d", // Dark Azure — 6th
  },

  typography: {
    heading: {
      // Codec Pro fallback per the guideline: a geometric sans with similar
      // proportions. Sora is the documented alternate.
      fontFamily: "'Poppins', 'Sora', sans-serif",
    },
    body: {
      fontFamily: "'Montserrat', sans-serif",
    },
  },

  logo: {
    lightBackground: "/brand/logo-light-bg.png",
    darkBackground: "/brand/logo-dark-bg.png",
  },
} as const;

export type RefactrdBrand = typeof refactrdBrand;