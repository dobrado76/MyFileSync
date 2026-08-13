# Testing

Manual and automated test guidance for MyFileSync.

## Automated (Vitest)

```bash
npm run test
```

Pure helpers under `src/shared/` are covered without Win32. Win32 integration tests run on Windows (local or CI).

```bash
npm run check    # typecheck, lint, test
```

## NTFS fixtures (Windows)

Alternate streams cannot be stored in Git. Generate them locally:

```powershell
.\scripts\create-fixtures.ps1
```

### List streams

1. `npm run dev`
2. From the renderer DevTools console:

```javascript
await window.myFileSync.adsList({
  path: 'F:\\Sites\\MyFileSync\\test\\fixtures\\ntfs\\generated\\sample-with-ads.txt',
})
```

**Expected:** manifest includes `Zone.Identifier` and `parameters` with non-zero sizes.

### Copy streams

```powershell
Copy-Item test\fixtures\ntfs\generated\sample-with-ads.txt `
  test\fixtures\ntfs\generated\sample-copy-target.txt
Clear-Content test\fixtures\ntfs\generated\sample-copy-target.txt
Set-Content test\fixtures\ntfs\generated\sample-copy-target.txt -Value "dest primary"
```

```javascript
await window.myFileSync.adsCopy({
  sourcePath: 'F:\\Sites\\MyFileSync\\test\\fixtures\\ntfs\\generated\\sample-with-ads.txt',
  destPath: 'F:\\Sites\\MyFileSync\\test\\fixtures\\ntfs\\generated\\sample-copy-target.txt',
})
```

**Expected:** `copiedStreams` lists both alternates; re-list on dest matches source manifest.

## CI

GitHub Actions on `windows-latest`: `npm run check`.

## Related

- [ADS_SYNC.md](ADS_SYNC.md) — stream model
