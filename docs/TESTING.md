# Testing

Manual and automated test guidance for MyFileSync.

## Automated (Vitest)

```bash
npm run test
```

Pure helpers under `src/shared/` are covered without Win32:

- `test/unit/result.test.ts`
- `test/unit/ads/paths.test.ts`

## Phase 0 — ADS spike (Windows manual)

### Prerequisites

- Windows 10/11 x64
- NTFS volume for fixtures
- Run `.\scripts\create-fixtures.ps1` from repo root

### List streams

1. `npm run dev`
2. In DevTools console (optional — or use a future UI):

```javascript
await window.myFileSync.adsList({
  path: 'F:\\Sites\\MyFileSync\\test\\fixtures\\ntfs\\generated\\sample-with-ads.txt',
})
```

**Expected:** manifest includes `Zone.Identifier` and `parameters` with non-zero sizes.

### Copy streams

1. Create an empty dest file (primary stream only):

```powershell
Copy-Item test\fixtures\ntfs\generated\sample-with-ads.txt `
  test\fixtures\ntfs\generated\sample-copy-target.txt
Clear-Content test\fixtures\ntfs\generated\sample-copy-target.txt
Set-Content test\fixtures\ntfs\generated\sample-copy-target.txt -Value "dest primary"
```

2. Invoke copy IPC:

```javascript
await window.myFileSync.adsCopy({
  sourcePath: 'F:\\Sites\\MyFileSync\\test\\fixtures\\ntfs\\generated\\sample-with-ads.txt',
  destPath: 'F:\\Sites\\MyFileSync\\test\\fixtures\\ntfs\\generated\\sample-copy-target.txt',
})
```

**Expected:** `copiedStreams` lists both alternates; re-list on dest matches source manifest.

### Exit criteria (Phase 0)

- [ ] List streams on fixture file
- [ ] Copy file with 2 ADS to new path; manifests match
- [ ] App window opens with status bar showing platform + version

## CI (planned)

GitHub Actions on `windows-latest`: `npm run check`.

## Related

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Phase 0 checklist
- [ADS_SYNC.md](ADS_SYNC.md) — stream model
