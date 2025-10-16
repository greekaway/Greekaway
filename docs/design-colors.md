# 🎨 Greekaway Color Palette v1

Canonical palette used across the site. These variables are defined in `public/css/style.css` under `:root` so they are globally available.

```css
:root {
  /* Official names */
  --color-background: #1B2A3A; /* κύριο φόντο */
  --color-background-gradient: linear-gradient(180deg, #1B2A3A 0%, #223345 100%);
  --color-logo-bg: #0E1520; /* φόντο λογότυπου & κουμπιών */
  --color-gold: #D4AF37; /* χρυσό λογότυπου & τίτλων */
}
```

Aliases to existing theme tokens (for compatibility):
- `--color-background` -> `--site-bg-color`
- `--color-background-gradient` -> `--site-gradient`

Usage tips
- Prefer using the `--color-*` tokens in new components.
- If you need RGB values for effects, keep them in local variables (e.g. `--gold-rgb: 212,175,55`).
- For category accent colors see the `--sea-* / --mountain-* / --culture-*` variables in `style.css`.
