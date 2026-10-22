# Reference

## Compare classification (practical)

For each relative path on an enabled pair:

- Directory index supplies size and modification time.
- If the pair **ADS** flag is on and the primary data already matches, stream **names and sizes** are compared. A matching body with different streams is **not** equal; the action is stream update (`UpdateStreamsOnly` in data; the grid describes a stream update).
- Same size, different time, streams equal, and **Touch timestamps only when file size already matches** on: action is a timestamp touch, not a full copy.
- Create + delete of the same size/time (and name heuristics) can become **Move** or **Rename** so Sync renames on the target instead of copying again and deleting.
- Items matching exclude rules are not listed. If include rules exist, non-matches are not listed.
- Equal items can be counted without a full grid row object (performance). **All** still represents them in stats; the grid is virtualized.

USN: cursors live in `%APPDATA%\myfilesync\compare-usn` and can be shared by jobs that use the same paths and filters. A journal reset or non-NTFS path falls back to a full walk. The window title can mention the change journal when that fast path is used.

## Sync order

Within one run, actions are sorted by tier, then (for creates and deletes) by path depth, then by estimated bytes, then by relative path:

1. Move, Rename  
2. TouchTime, UpdateStreamsOnly  
3. Update — smaller files first  
4. Create — shallower paths first, then smaller files (parents exist before deep children)  
5. Delete — deeper paths first, then smaller estimates (children before parents)

Deletes stay last so a mirror copies replacements before removing extras. Work-byte estimate: moves, renames, timestamp touches, and deletes count as 0; stream updates use the sum of ADS sizes; updates and creates use the source side’s file size.

Cancel sets a flag and aborts the current copy. The progress phase becomes cancelled. Finished items are removed from the stored change list so the next Sync is a resume, not a repeat of successes.

Partial retry (one row or **Retry failed**) sends only those row ids. It does not wipe the whole failure list; successes drop off the list.

## Mirror delete confirm

If `confirmMirrorDeletes` is true and the compare stats include deletes, **Sync** opens **Confirm mirror deletes** with the delete count. **Sync anyway** continues. **Cancel** does not delete. **Don't show again** sets `confirmMirrorDeletes` to false.

A sync **queued during Compare** skips that dialog: clicking Sync while Compare runs is treated as consent, including deletes. **Sync this folder now** still shows the dialog when that folder has deletes and the setting is on.

CLI `--run` / `--batch` also do not show the dialog.

## Read-only and permissions

Destination read-only is cleared, the write is attempted, then the attribute is restored to match the source when that is the implemented path. A hard failure still produces a sync failure row with a plain-language message (access denied, read-only folder, and similar — not a raw `EPERM` code as the only text).

**Clear read-only** on a failure uses the target path, then retries that row.

## Paths

Main process normalizes paths before IO. Long paths and UNC are Windows-specific. UNC ADS is best-effort after a preflight probe; if the share cannot store streams, body copy may still be attempted and stream mismatch remains.

Recycle Bin deletes use the shell recycle API when `delete.useRecycleBin` is true. If the recycle operation cannot be used, behaviour falls through to the delete implementation for that path; do not assume every volume supports the Recycle Bin (some network deletes are permanent). Prefer a small test before a large mirror with recycle off.

## Job lock

`compareBusy` or `syncBusy` blocks: select job, new, delete, import, save, pair edits, variant, filters, and the Options checkboxes. Status text if something still calls through: finish or cancel compare/sync before changing the job.

## Versions and filenames

- App version: `package.json` `version` (example **0.2.16**).
- Installer: `MyFileSync-Setup-<version>.exe`
- Display: patch `.0` may show as a short `vX.Y`.
- Job `version` is always `1` for this schema.
- Update check compares versions parsed from installer **filenames** in the updates folder. It does not query GitHub.

## Error and exit codes

GUI failures are objects: message, optional hint, optional code (`not-allowed` is used for read-only style failures that offer **Clear read-only**).

CLI:

| Code | Meaning |
| --- | --- |
| 0 | Compare-only ok, or sync completed with no failed items |
| 1 | Bad usage, thrown error, sync cancelled, or one or more actions failed |

There is no public HTTP API. The UI talks to the main process over a typed preload bridge (`Result` success or `{ ok: false, error }`). That bridge is not for other apps to call.

## Limits that are enforced

- At least one folder pair.
- Compare workers and copy parallelism: integers 1–32.
- Pair list height if set: 40–4000.
- Progress panel width: 180–1200.
- Watch debounce: at least 100 ms.
- SFTP port: 1–65535.
- Compare change list is an append-only JSONL file; it refuses to grow past about 4 GB (narrow the pair or add filters).

## Statistics line

After compare, the status text is built from stats: total items, count to sync, and move count when moves were detected. The grid can still look empty if a filter such as **Errors** matches nothing — a new Compare resets the filter to **All** to avoid that trap. If you change the filter yourself to **Errors** before any failure, the button is disabled when there are no errors.
