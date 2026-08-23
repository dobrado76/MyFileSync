# UI design

FreeFileSync-inspired **compare-first** layout with modern Electron chrome (dark/light).

The workbench uses a **title bar** (Job picker + New, Settings) and a **job toolbar** (name, Import / Save / Delete / Clear) with tabs: **Options | Compare | Filters | Log**. Settings live in a header modal, not on the main surface.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ MyFileSync          Job ▾  [+ New]            [Settings]    │
├─────────────────────────────────────────────────────────────┤
│ Name  [Import…] [Save] [Delete] [Clear]                     │
│ Options | Compare | Filters | Log                           │
├─────────────────────────────────────────────────────────────┤
│ Source folder     [Mirror ▾] [Size+time ▾]   Target folder  │
│ [F:\Photos …] [⇄] [Z:\Backup\Photos …]            [↑][↓][×] │
│ [F:\Docs …]   [⇄] [Z:\Backup\Docs …]              [↑][↓][×] │
│ + Add folder pair                                           │
├──────────────┬──────────────────────────────────────────────┤
│ Folders      │ ☑  Source            Action      Target      │
│ ▾ Photos     │    a.jpg             Update      a.jpg       │
│   ▾ 2024     │    b.jpg             Create      —           │
│     trip     │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ [Compare] [Sync]  Files: 12,450              [Cancel]       │
├─────────────────────────────────────────────────────────────┤
│ Progress (graphs + counts) or status-bar string             │
└─────────────────────────────────────────────────────────────┘
```

## Regions

### Title bar

- App name and version on the left; **Job** dropdown and **+ New** centered; Settings on the right.

### Jobs (toolbar)

- Name field, **Import…** (FreeFileSync `.ffs_gui` / `.ffs_batch`, INI, JSON), **Export…** (FreeFileSync `.ffs_gui` / `.ffs_batch`), Save, Delete, Clear.

### Folder pairs (Options tab)

All pairs are stacked and visible at once (FreeFileSync-style) — not a dropdown. Column headers once: **Source folder** | variant + compare method | **Target folder** | **ADS**. Each row is a **checkbox** (include in Compare/Sync) then `[left path] […]` `⇄` `[right path] […]` then an **ADS** checkbox then ↑ ↓ ×. The include checkbox is `pairs[].enabled`; the ADS checkbox is `pairs[].ads` (default on). Untick ADS when that pair does not need alternate streams — Compare will not list them and Sync skips extra stream work. Keep unused pairs in the same job and tick only the ones to run. Path fields are normal text: type, copy, paste, or Browse (**…**). **+ Add folder pair** sits under the list. A **horizontal splitter** under the pair panel resizes how much of the list is shown; the list scrollbar appears only when pairs overflow that height. That height is stored on the job (`ui.pairListHeight`) so it comes back after you switch tabs or reopen the job. Compare/Sync run every **enabled** pair; the tree root is **All folders** when more than one pair is enabled.

### Options tab

Folder pairs and variant. Filters have their own tab (pattern vs this path).

### Compare tab (job settings)

Compare method, NTFS change journal, ADS cache, Recycle Bin, workers, watch. A **Search settings** box at the top filters as you type (debounced; every word must match).

### Compare results

Filter bar (All | Differences | Source only | Target only | Deleted | Moved | ADS ≠) sits above a **split**:

- **Folder tree (left)** — built from the change list after Compare (not a second disk walk). Classic tree chrome: dotted guides, folder icons, boxed +/−. The count is items in that branch. After every Compare, **only the root is expanded** (nested folders stay collapsed until you open a twistie). Exclude, Sync a folder, and filter changes keep whatever you already opened. Click a folder to show only that branch in the grid. Right-click a folder:

  - **Open source / Open target** — Windows default app for that file or folder.
  - **Reveal source / Reveal target** — open the parent folder and select the item (`mfe://reveal`) so you can inspect before Sync (especially Deletes).
  - **Exclude this folder permanently** — add a path filter (`/name` or `parent/name`) and remove it from this compare.
  - **Exclude folders named “X” permanently** — add a name filter (any depth) and remove matching items from this compare.
  - **Exclude this folder from this compare** — hide it for this run only (next Compare brings it back).
  - **Sync this folder now** — run only that branch, then drop succeeded items from the tree.
- **Change list (right)** — two-pane Source / Action / Target grid. Rows are virtualized (only the visible window is in the DOM). Right-click a row for the same Open and Reveal actions (source and/or target, whichever still exists).

The tree only contains folders that have remaining diffs (equals are counted, not stored). Pair roots and folders with no changes are omitted — they disappear after **Sync this folder now** or a full Sync once that branch is empty. A folder missing on one side lists every nested file and folder; the count is that full set. Moves appear under both the old and new folders. The tree count is the number of Sync actions in that branch — if it says 2000, Sync copies/updates/deletes/moves 2000 items.

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
- **Hardware acceleration (GPU)** — on by default. Turn off if the window flickers or stays blank; restart to apply.
- Export/import app settings (excludes window geometry).

## Primary actions

| Button | Shortcut | Behavior |
|--------|----------|----------|
| Save | Ctrl+S | Write the current job to disk |
| Compare | F5 | Run compare for active job |
| Sync | | Execute included actions (confirm if deletes &gt; 0) |
| Cancel | Esc | Stop compare or sync. Compare keeps diffs already found. Sync drops items that already succeeded so the next Sync is a resume. |

## Progress / status bar

- Left: `Comparing… N items · path` (live count) plus elapsed time.
- Center: `done / total` files + throughput.
- Right: ETA + Cancel.

Mirror with deletes: modal confirm — “Remove 42 files/folders on right?”

## Error presentation

- Toast for single-item failure during sync; continue queue.
- Modal summary at end if errors &gt; 0.
- Messages use D11 plain language (read-only folder, permission denied).

### Run progress

During Compare or Sync a **progress panel** sits above the status bar: percent, current path, processed/remaining counts, elapsed/ETA, and graphs (bytes on Sync, items on both). The graphs keep the **whole phase** (older points are coarsened, never below one sample per physical plot pixel; the last seconds stay dense for the rate). Enumerating and Comparing each get their own series; Comparing’s clock starts at enumerate elapsed (not 00:00). Compare shows **Enumerating…** until the item count is known, then **Comparing… N%** with remaining and ETA. A down-arrow **minimizes** it to the status-bar string. The status bar then has **Progress** to open it again. The last choice is remembered (`settings.progressUiExpanded`).

## Theming

CSS variables `--bg`, `--fg`, `--accent`, `--row-equal`, etc.

Default **system** theme; persist in `settings.json`.

## Accessibility

- Keyboard: arrow keys in grid, Space toggle include, Enter open detail.
- High-contrast friendly row colors (not color-only — action column has text).

## Non-goals (UI)

- Dual **browse** trees for picking source/target folders (FFS folder pickers — we use editable path fields plus an OS browse dialog). The **results** folder tree on the left of the change list is in scope.
- Ribbon UI.

## Related

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
- [IPC_CONTRACT.md](IPC_CONTRACT.md)
