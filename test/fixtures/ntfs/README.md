# NTFS fixtures

Alternate data streams cannot be stored in Git. Generate them locally:

```powershell
.\scripts\create-fixtures.ps1
```

This creates `generated/sample-with-ads.txt` with:

- Primary `$DATA` — text body
- `Zone.Identifier` — Mark-of-the-web style content
- `parameters` — custom text stream

Committed placeholder files in this folder document expected layout only.
