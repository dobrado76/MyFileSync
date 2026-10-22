# Roadmap

Only distinctions that the repository itself supports. This is not a promise of future releases.

## Shipped in 0.2.x (this tree)

- Mirror, Update, Auto, Two-way
- Multi-pair jobs, per-pair ADS checkbox
- Size + time compare, ADS manifests, move/rename detection, optional timestamp touch
- NTFS change journal skip
- Filters, Recycle Bin deletes, mirror confirm (GUI)
- Failure list, clear read-only + retry, queued sync during compare
- Last-job restore, job lock during compare/sync
- Sync ordered small/fast work before large copies
- FreeFileSync GUI/batch import, CLI `--run` / `--batch`, folder watch flag
- Local installer update check
- SFTP primary-stream copy

## Present in schema or code but not a finished product feature

- `vss.enabled` — not a working locked-file copy
- `syncRules` — no editor
- `versioning` — overwrite copies can run when `versioning.enabled` is true in the job JSON, before update/delete. The live Options list has no versioning checkbox (an unused editor component still contains one). Do not tell users to open an “Edit job” dialog; it is not on screen. FreeFileSync import may set the JSON and warn that FFS versioning-on-delete is not the same thing.
- `behavior.archiveFlagScanOnly` — field exists; not described as a visible Options row in the current settings panel

## Explicitly out of scope

- macOS and Linux as supported targets
- Built-in cloud providers
- Email logs
- Content-hash compare and verify-after-copy
- Deduplicating archives
- Full FreeFileSync parity (every filter operator, VSS batch mode)

If a control is not in the user guide, treat it as not shipped rather than “hidden”.
