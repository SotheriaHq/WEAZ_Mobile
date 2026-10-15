# Phase 9A-1: Catalog & Market Visual Surface Fixes

## Background Audit
The previous background colors relied on `theme.colors.bg`. However, in Dark mode, `theme.colors.bg` resolved to pure black `#000000`, while the intended baseline for Catalog, Profile, and Market screens is the surface color `#0B0F17` in dark mode, `#FFFFFF` in light mode.