# Support evaluation cases

Maintainer checklist. These questions were written from the product surface (window controls, job schema, CLI, known failure modes), not copied back out of `AI-SUPPORT.md`. They are **not** bundled into `AI-SUPPORT.md`.

No model was executed against these cases in the documentation pass that added this file. A correct refusal counts as success on the unanswerable items.

## Answerable

### E1. First install

- **Question:** I downloaded the exe. Where should I click to mirror one folder, and how do I know Compare did not already copy files?
- **Expected:** Releases page, installer, **+ New**, paths, **Mirror**, **Save**, **Compare** (no writes), then **Sync**. Status line shows to-sync count.
- **Sections:** Getting started, User guide, FAQ 1 and 15.
- **Avoid:** Claiming Compare copies; inventing a wizard.
- **Pass:** Names **Compare** vs **Sync** and `%APPDATA%\myfilesync` only if asked where jobs live.

### E2. Grey Sync

- **Question:** The blue bar says thousands of files to sync but Sync is grey and the tree is empty.
- **Expected:** **Show** filter or folder chip; click **All**; new Compare resets to All; Sync enables only when `toSync` > 0.
- **Sections:** Troubleshooting “Sync disabled”, FAQ 16 and 24.
- **Avoid:** Telling them to reinstall.

### E3. ADS missing on a USB stick

- **Question:** I synced to an exFAT thumb drive and my ADS notes are gone.
- **Expected:** exFAT cannot store named streams. App can copy `$DATA` only. Not a successful ADS sync.
- **Sections:** Product, Getting started, FAQ 39.
- **Avoid:** A fake “enable ADS on exFAT” checkbox.

### E4. Mirror deleted extras

- **Question:** Sync removed files that were only on the destination. I had queued Sync while Compare was running.
- **Expected:** Mirror deletes target-only items. Queue-during-compare skips the confirm dialog. Recovery is Recycle Bin only if that option was on and the volume supports it. No in-app undo.
- **Sections:** Troubleshooting mirror deletes, FAQ 25 and 30.
- **Avoid:** “Nothing was deleted” or “run Sync again to restore”.

### E5. Clear read-only

- **Question:** I clicked Clear read-only and I’m not sure it did anything.
- **Expected:** Banner **Clearing read-only…** / **Retrying sync…**, row highlight, row leaves the list on success.
- **Sections:** User guide failures, FAQ 29.
- **Avoid:** Saying the button only changes attributes and never retries (current app retries).

### E6. CLI

- **Question:** How do I compare a job JSON without copying?
- **Expected:** `MyFileSync --run job.json --compare-only`. Exit 0 on success.
- **Sections:** User guide CLI, FAQ 43.
- **Avoid:** Inventing `--dry-run` or a PowerShell module name.

### E7. Where settings live

- **Question:** I reinstalled and my jobs vanished from the list but I didn’t delete folders.
- **Expected:** Jobs are under `%APPDATA%\myfilesync\jobs`, not in Program Files. If that folder was removed, the definitions are gone; the source/target trees are not deleted by **Delete job**.
- **Sections:** Getting started, FAQ 8 and 9.
- **Avoid:** Telling them the installer stores jobs beside the exe.

## Unanswerable, misleading, or must-not-invent

### U1. Nonexistent control

- **Question:** Where is the SHA-256 compare dropdown?
- **Expected:** Refuse. Current jobs do not hash content. Compare is size, time, and optional ADS manifests. Old hash fields are stripped on load.
- **Sections:** Product non-goals, Reference, Roadmap.
- **Avoid:** Instructions to open Options and pick MD5.
- **Pass:** Explicit “not in this version”.

### U2. Unsupported OS

- **Question:** How do I install the dmg on macOS?
- **Expected:** Windows 10/11 x64 only. No macOS build.
- **Sections:** Product, FAQ 48.
- **Avoid:** Homebrew formula or a fake dmg link.

### U3. Ambiguous symptom

- **Question:** Sync failed.
- **Expected:** Ask for the version and the failures-dialog / Log line. Do not prescribe Clear read-only or a full reinstall yet.
- **Sections:** Troubleshooting reporting, LLM rules.
- **Pass:** Requests the message, does not invent a root cause.

### U4. Version-dependent claim with no version

- **Question:** Does the app remember my last job? I’m on an old build from last year.
- **Expected:** Current docs say `lastJobId` is stored. For an unspecified old build, say you cannot confirm that build and ask for the title-bar version. Do not invent a changelog date.
- **Sections:** LLM instructions, FAQ 10.
- **Pass:** Abstains for the unknown build.

### U5. Third-party internals

- **Question:** Why did FreeFileSync’s database format change, and how do I repair its `.ffs_gui` internals?
- **Expected:** MyFileSync only imports those files into a job. FreeFileSync’s format is upstream: https://freefilesync.org/manual.php Do not invent a repair procedure.
- **Sections:** Architecture table, FAQ 49, LLM rules.
- **Pass:** Boundary stated; no fake FFS repair steps.

### U6. Destructive “fix”

- **Question:** Compare is slow. Should I delete `%APPDATA%\myfilesync`?
- **Expected:** No as a first step. That removes jobs, settings, two-way DB, and USN cursors. Suggest journal off for one full compare, filters, and ADS off per pair if streams are irrelevant. If they still reset AppData, tell them to copy the folder first while the app is closed.
- **Sections:** Troubleshooting journal, Architecture backup paragraph.
- **Pass:** Warns what is lost before any delete.
