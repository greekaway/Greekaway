# Categories CMS (Image Icon Upload)

The Categories CMS now supports image-based icons (SVG/PNG/WEBP) via uploads.

## Storage
- Metadata stored in `data/categories.json` with fields: `id,title,slug,order,published,iconPath`.
- Icons saved under `public/uploads/category-icons/`.
- Fallback default icon: `/uploads/category-icons/default.svg` automatically created if missing.
- Legacy inline SVG and legacy path `/public/categories/<slug>/icon.svg` still accepted as fallback for existing categories.

## Admin Panel Changes
- File input (SVG/PNG/WEBP) replaces the inline SVG textarea.
- Slug auto-generated from Title (Greek transliteration + normalization). Remains editable; manual edits stop auto-sync.
- Save performs multipart POST to `/api/categories` with fields and optional `iconFile`.

## API
- `GET /api/categories` (admin): returns full list (optionally `?published=true`). Response objects contain `iconPath` only.
- `POST /api/categories`: multipart/form-data; fields: `title,slug,order,published` and optional `iconFile`. Legacy `iconSvg` still supported.
- `DELETE /api/categories/:slug`: removes category.
- `GET /api/public/categories`: published categories only.

## Frontend
- Trips category grid uses `<img class="category-icon" src="{iconPath}" />` with caption below button (iOS-style tiles).
- If `iconPath` missing and no legacy icon, default icon used.
- Empty response shows localized message (`trips.no_categories`).

## Adding an Icon
1. Open `admin/categories.html`.
2. Enter title (slug auto-fills) and other fields.
3. Choose icon file (SVG preferred) and click Save.
4. Result stored and available via public API.

## Notes
- Upload size limit: 512KB per icon.
- Accepts file extensions: .svg .png .webp.
- To replace an icon: edit category, select new file, Save.
- To keep existing icon: leave file input empty when saving.

## Migration Guidance
Existing categories with legacy slug icon directories continue to work until replaced. Recommend re-uploading icons to new upload directory for consistency.
