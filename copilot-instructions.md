# Copilot Rules for Greekaway (Persistent)

This repository defines strict rules to avoid duplicate files and ensure safe edits.

## File Creation Guard Policy

Before creating any new file, the assistant must:

1) Search existing files
- Run a full-text and path search for the exact intended `path` and for the `basename`.
- If any match exists, DO NOT create a new file. Propose editing the existing file(s) and show paths.

2) Consult the maps
- Check `repo-functional-map.md` to find the correct category and canonical location.
- If available, read `reports/repo-inventory.json` to list similar names/paths.

3) Confirm with the user
- If a close match exists (same basename or same role), ask the user to confirm reuse vs new.
- Default to reuse/edit unless the user explicitly approves a new file with a distinct path and purpose.

4) Category-to-folder mapping (canonical locations)
- ROUTES → `routes/`
- SERVICES → `services/`
- SERVER CORE → `server.js`, `src/server/**`
- CLIENT JS → `public/js/**`
- PROVIDER PANEL → `public/provider/**`
- DRIVER PANEL → `public/driver/**`
- ADMIN PANEL → `public/admin*`, `public/admin/**`, `public/admin-addons/**`
- I18N → Server canonical in `locales/**`; client bundles in `public/i18n/**`
- DATA → `data/**`
- HTML views → `public/*.html` and per-panel folders
- CSS → `public/css/**` and per-panel CSS under their folders
- TOOLS / SCRIPTS → `tools/**` (dev/ops), `scripts/**` (ops/dev)

5) Naming rule
- If server and client files share a concept, use folder context for disambiguation, do not duplicate names in the same folder. Prefer existing naming where present.

6) Output locations for generated artifacts
- Inventory/report outputs MUST be under `reports/`.
- Transient tool outputs should go under `reports/` or a tool-specific subfolder inside `tools/`, never at project root.

## Assistant Behavior in New Chats
- On new sessions, the assistant must first read this file, `repo-functional-map.md`, and (if present) `reports/repo-inventory.json` before proposing file creation.
- The assistant must show the results of the search (existing files) and ask for confirmation to reuse vs create.
