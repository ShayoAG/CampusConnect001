# Admin Intelligence Skin

Magenta/green intelligence-driven theme for the LSS Layout System. Implements OKLCH color tokens, light/dark modes, WCAG AA focus treatment, and elevated visual hierarchy for analytics-heavy admin surfaces.

## Installation

### CDN
```html
<link rel="stylesheet" href="https://shayoag.github.io/LSS-Layout-System/core/foundations.css">
<link rel="stylesheet" href="https://shayoag.github.io/LSS-Layout-System/skins/admin-intelligence/tokens.css">
<link rel="stylesheet" href="https://shayoag.github.io/LSS-Layout-System/skins/admin-intelligence/components.css">
```

### Local bundle
```bash
cp -r skins/admin-intelligence/ /your-app/styles/skins/
```
```html
<link rel="stylesheet" href="/styles/skins/admin-intelligence/tokens.css">
<link rel="stylesheet" href="/styles/skins/admin-intelligence/components.css">
```

Set the HTML attributes to activate the theme:
```html
<html lang="en" data-skin="admin-intelligence" data-theme="light">
```

Switch modes with:
```javascript
const root = document.documentElement;
root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
```

## File Map

| File | Purpose |
|------|---------|
| `tokens.css` | Base, state, and mode-specific design tokens |
| `components.css` | Component overrides layered above core styles |
| `preview.html` | Visual QA sandbox with theme toggle |
| `skin.json` | Metadata consumed by build tooling |

## Design Tokens

### Brand Colors (WCAG AA ready)
| Token | Value | Fallback | Notes |
|-------|-------|----------|-------|
| `--ai-brand-magenta` | `oklch(0.58 0.25 330)` | `#d946a6` | Primary action, focus |
| `--ai-brand-green` | `oklch(0.74 0.19 140)` | `#22c55e` | Success & progress |
| `--ai-brand-magenta-contrast` | `oklch(0.14 0.02 250)` | `#0f0a16` | Text on magenta |
| `--ai-brand-green-contrast` | `oklch(0.96 0.01 250)` | `#f9fafb` | Text on green |

### Surface & Text
| Scope | `--bg` | `--surface` | `--text-1` | `--text-2` |
|-------|--------|-------------|------------|------------|
| Light | `oklch(0.99 0.01 250)` | `oklch(0.95 0.01 250)` | `oklch(0.20 0.02 250)` | `oklch(0.42 0.02 250)` |
| Dark | `oklch(0.16 0.01 250)` | `oklch(0.20 0.01 250)` | `oklch(0.96 0.01 250)` | `oklch(0.85 0.01 250)` |

Additional semantic tokens:
- Borders: `--border`, `--border-subtle`
- Focus: `--focus`, `--shadow-focus`
- State colors: `--success`, `--warning`, `--danger`

### Typography
| Token | Value |
|-------|-------|
| `--font-heading` | `ui-rounded, "Poppins", system-ui, sans-serif` |
| `--font-body` | `ui-sans-serif, "Inter", system-ui, sans-serif` |
| `--h1 / --h2 / --h3` | `2rem`, `1.5rem`, `1.125rem` |
| `--body / --small` | `1rem`, `0.875rem` |
| `--leading / --leading-tight` | `1.45`, `1.25` |

### Spacing
`--space-1` → `0.25rem` through `--space-12` → `3rem` in ~0.25rem increments for consistent rhythm.

### Gradients
- `--gradient-hero`: Hero and navbar backgrounds
- `--gradient-soft`: Subtle section fills
- `--gradient-progress`: Progress indicators

### Radius & Shadows
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-s` | `8px` | Tags, nav links |
| `--radius-m` | `12px` | Buttons, inputs, quiz options |
| `--radius-l` | `16px` | Cards, media |
| `--radius-full` | `9999px` | Pills, progress bars |
| `--shadow-s` | `0 1px 2px rgba(15, 10, 22, 0.1)` | Card base |
| `--shadow-m` | `0 6px 18px rgba(15, 10, 22, 0.16)` | Navbar, hover |
| `--shadow-l` | `0 12px 32px rgba(15, 10, 22, 0.2)` | Elevated overlays |

All gradients and shadows automatically adapt in dark mode to maintain depth and contrast.

## Component Coverage
- Buttons (`.lss-btn--primary`, `.lss-btn--secondary`) with hover, focus-visible, and disabled states
- Navigation bar, including link focus affordances
- Cards, progress bars, quiz options, and media wrappers
- Form inputs, error treatment, and keyboard focus outlines

See `preview.html` for live examples of each component in light and dark mode.

## Browser Support
| Browser | Minimum | Notes |
|---------|---------|-------|
| Chrome | 90+ | OKLCH fully supported from 111+, hex fallbacks used below |
| Firefox | 88+ | OKLCH from 113+, fallbacks keep colors accessible |
| Safari | 14+ | Hex fallbacks ensure brand fidelity on 14-15.3 |
| Edge | 90+ | Matches Chromium support matrix |

## Performance Budgets
- `tokens.css`: **3.6 KB** (3648 bytes) → **1.1 KB gz**
- `components.css`: **8.6 KB** (8575 bytes) → **1.3 KB gz**
- Combined total: **12.2 KB** raw, **2.5 KB** gz (well under 50 KB budget)

To validate locally:
```bash
wc -c skins/admin-intelligence/*.css
gzip -c skins/admin-intelligence/tokens.css | wc -c
gzip -c skins/admin-intelligence/components.css | wc -c
```

## Accessibility & Testing
- Color pairs achieve ≥4.5:1 contrast; focus rings ≥3:1 against surfaces
- Checklist available at `tests/accessibility/admin-intelligence-checklist.md`
- Visual regression baselines stored under `tests/visual-regression/`
- Manual graceful degradation check: load page without `components.css`; tokens still apply core theming

## Cross-browser Verification
- Chrome 119 (macOS) — full OKLCH + @layer support
- Firefox 120 (macOS) — OKLCH confirmed, fallbacks unused
- Safari 16.4 (macOS) — hex fallback exercised, gradients preserved
- Edge 119 (Windows 11) — matches Chromium rendering

## Preview & Integration Support
- Launch `skins/admin-intelligence/preview.html` to explore the theme and toggle light/dark modes
- Integration troubleshooting and advanced usage tips live in `specs/001-admin-intelligence-skin/quickstart.md`
