# UI design

FreeFileSync-inspired **compare-first** layout with modern Electron chrome (dark/light).

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Menu: File  Job  Compare  Sync  View  Help                  │
├──────────┬──────────────────────────────────────────────────┤
│ Jobs     │  [Compare ▼] [Filter: diffs only ▼]  [▶ Sync]   │
│ rail     ├──────────────────────────────────────────────────┤
│          │  Path          │ Left size/time │ Right │ Action │ ADS │
│ ▣ Dev    │  src/foo.txt   │ 1.2 MB  …      │ …     │ →     │ =   │
│ ▣ Photos │  src/bar/      │ …              │ …     │ ⊕     │ +1  │
│          ├──────────────────────────────────────────────────┤
│ + New    │  Detail / stream preview (collapsible bottom)    │
├──────────┴──────────────────────────────────────────────────┤
│ Status: 1,234 compared · 56 to sync · ▓▓▓░░ 45%  [Cancel]  │
└─────────────────────────────────────────────────────────────┘
```

## Regions

### Jobs rail (left, ~240px resizable)

- List of saved jobs with enable checkbox per job (for batch Phase 2).
- Last run: icon ✓ / ⚠ / ✗ + timestamp.
- **+ New job** → editor drawer.
- Context menu: Duplicate, Export JSON, Delete, Import INI.

### Job editor (drawer / modal)

Tabs: **Pairs** | **Variant** | **Compare** | **ADS** | **Filters** | **Advanced**

- Pairs: table left/right paths, browse buttons, enabled, remove.
- Variant: radio Mirror / Update / Automatic / Two-way (disabled until Phase 2).
- ADS: sync all streams, exclude list, write cache to ADS checkbox.
- Advanced: VSS, verify, parallelism sliders.

### Compare grid (center)

Virtualized table (`@tanstack/react-virtual` or equivalent).

| Column | Content |
|--------|---------|
| ☑ | Include in sync |
| Relative path | Tree indent optional Phase 1.5 |
| Left | Size, date |
| Right | Size, date |
| Action | Icon + label (Create, Update, Delete, …) |
| ADS | Badge: `=` equal, `≠` diff, `+n/-m` stream delta |

**Row colors** (CSS variables, dark-mode safe):

| State | Color role |
|-------|------------|
| Equal | Muted green background |
| Copy left → right | Blue |
| Copy right → left | Teal |
| Delete | Red tint |
| Conflict / ambiguous | Yellow |
| Excluded | Strikethrough + gray |
| Error from last run | Orange border |

**Toolbar filters** (toggle buttons): All | Differences | Left only | Right only | ADS diff | Errors

### Detail pane (bottom, optional)

- Selected row: full paths, attributes, ACL read-only flag warning.
- **Streams** sub-table: name, left size, right size, [Preview].
- Preview: UTF-8 text or hex dump (cap 64 KiB).

Double-click row → modal **Action detail** (BackupMirror `ShowAction` revival): single-item run, toggle include, action type override.

### Run log tab

- Table: time, job, pair, action counts, duration, log file link.
- Export JSONL.

### Settings tab

- Theme, default parallelism, default delete policy, log retention.
- Export/import app settings (excludes window geometry).

## Primary actions

| Button | Shortcut | Behavior |
|--------|----------|----------|
| Compare | F5 | Run compare for active job |
| Sync | Ctrl+S | Execute included actions (confirm if deletes &gt; 0) |
| Cancel | Esc | Abort long compare/sync |
| Pause | — | Phase 2 |

## Progress / status bar

- Left: phase label (`Comparing…`, `Copying…`, `Listing ADS…`).
- Center: `done / total` files + throughput.
- Right: ETA + Cancel.

Mirror with deletes: modal confirm — “Remove 42 files/folders on right?”

## Error presentation

- Toast for single-item failure during sync; continue queue.
- Modal summary at end if errors &gt; 0.
- Messages use D11 plain language (read-only folder, permission denied).

## Theming

CSS variables `--bg`, `--fg`, `--accent`, `--row-equal`, etc.

Default **system** theme; persist in `settings.json`.

## Accessibility

- Keyboard: arrow keys in grid, Space toggle include, Enter open detail.
- High-contrast friendly row colors (not color-only — action column has text).

## Non-goals (UI v1)

- Side-by-side dual tree browsable panes (FFS has folder pickers — we use path fields + OS browse dialog).
- Ribbon UI.

## Related

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
- [IPC_CONTRACT.md](IPC_CONTRACT.md)
