# Security

## Threat model (realistic)

MyFileSync is a **local power-user tool** that reads/writes arbitrary user-selected paths. It is not a sandboxed web app. Risks:

- Destructive sync (mirror delete on wrong target)
- Path traversal via malicious job files
- Sync to unintended locations via symlink tricks

## Path validation

All paths from renderer/CLI/job files pass through main-process normalization:

1. **`requireAbsolute(path)`** — reject relative, empty, `..` escape after normalize.
2. **Resolve to absolute** with `path.resolve` on Windows; preserve UNC (`\\server\share`).
3. **Long paths** — prefix `\\?\` when ≥ 260 chars for Win32 APIs (ADS stream paths).
4. **Reject** `mfe-remote://` or future non-local schemes unless explicitly supported.

Job JSON stores paths as typed strings; validate on load with Zod.

## Sync safety

| Control | Behavior |
|---------|----------|
| **Review before sync** | Default: compare then explicit Sync click (D10) |
| **Mirror deletes** | Show delete count in confirm dialog when &gt; 0 |
| **Permanent delete** | Confirm when multiple items or folder trees |
| **Recycle Bin default** | D6 — `SHFileOperation` with `FOF_ALLOWUNDO` |
| **Read-only target** | Detect `FILE_ATTRIBUTE_READONLY`; block with plain message |
| **Same path guard** | Reject left === right after normalize |

## ADS-specific

- Stream names validated: forbid `< > : " / \ | ? *` in names (allow C0 controls per NTFS parity).
- Do not execute stream **contents** — treat as binary/text data only.
- `Zone.Identifier` is data, not executable — still user-controlled bytes in preview pane (sanitize display).

## IPC

- Context isolation enabled; no `nodeIntegration` in renderer.
- All IPC payloads validated with Zod.
- Result envelope — never throw raw Error strings to renderer without code.

## Job import

- INI/JSON import from disk is user-initiated only.
- Cap job file size (e.g. 10 MB) and pair count (e.g. 256 pairs).

## Logging

- Logs may contain full paths — store under `userData/logs`; never auto-upload.
- Optional export is user-driven.

## Non-goals

- Encryption at rest for job files (user may use EFS/BitLocker on disk).
- Multi-user ACL management (OS handles permissions; app surfaces errors clearly).
