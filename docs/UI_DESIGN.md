# UI design

FreeFileSync-inspired **compare-first** layout with modern Electron chrome (dark/light).

The workbench uses a **header toolbar** (job picker, paths, Compare / Sync / Cancel) and tabs: **Options | Compare | Filters | Log**. Settings live in a header modal, not on the main surface.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ MyFileSync          [Settings]                              │
├─────────────────────────────────────────────────────────────┤
│ Job ▾  Name  [+ New] [Save]   Source …   Target …           │
│ [Compare] [Sync] [Cancel]     Options | Compare | Filters | Log │
├──────────────┬──────────────────────────────────────────────┤
│ Folders      │ ☑  Source            Action      Target      │
│ ▾ Photos     │    a.jpg             Update      a.jpg       │
│   ▾ 2024     │    b.jpg             Create      —           │
│     trip     │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ Comparing… 12,450 items · path                      1:05    │
└─────────────────────────────────────────────────────────────┘
```

## Regions

### Jobs (toolbar)

- Job dropdown, name field, + New, Save, Delete.
- Source / target path fields with browse; pair add/remove/flip.

### Options tab

Compare method, ADS cache, Recycle Bin, workers, watch, variant. Filters have their own tab (pattern vs this path).

### Compare results

Filter bar (All | Differences | Source only | Target only | Deleted | Moved | ADS ≠) sits above a **split**:

- **Folder tree (left)** — built from the change list after Compare (not a second disk walk). Folder names use normal text; the count is items in that branch. After every Compare, **only the root is expanded** (nested folders stay collapsed until you open a twistie). Click a folder to show only that branch in the grid. Right-click a folder:

  - **Exclude this folder permanently** — add a path filter (`/name` or `parent/name`) and remove it from this compare.
  - **Exclude folders named “X” permanently** — add a name filter (any depth) and remove matching items from this compare.
  - **Exclude this folder from this compare** — hide it for this run only (next Compare brings it back).
  - **Sync this folder now** — run only that branch, then drop succeeded items from the tree.
- **Change list (right)** — two-pane Source / Action / Target grid.

The tree only contains folders that have diffs (equals are counted, not stored). A collapsed missing-side folder is one node. Moves appear under both the old and new folders.

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
| Move / rename | Purple |

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

## Progress / status bar

- Left: `Comparing… N items · path` (live count) plus elapsed time.
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

## Non-goals (UI)

- Dual **browse** trees for picking source/target folders (FFS folder pickers — we use path fields + OS browse dialog). The **results** folder tree on the left of the change list is in scope.
- Ribbon UI.

## Related

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
- [IPC_CONTRACT.md](IPC_CONTRACT.md)
