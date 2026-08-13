#Requires -Version 5.1
<#
.SYNOPSIS
  Creates NTFS ADS test fixtures for MyFileSync Phase 0 manual verification.

.DESCRIPTION
  Generates files under test/fixtures/ntfs/generated/ with alternate data streams.
  Run from repo root: .\scripts\create-fixtures.ps1
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$fixtureDir = Join-Path $root 'test\fixtures\ntfs\generated'
New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null

$sourceFile = Join-Path $fixtureDir 'sample-with-ads.txt'
$primaryContent = "Primary data stream content.`r`n"
Set-Content -Path $sourceFile -Value $primaryContent -Encoding UTF8 -NoNewline

$zoneContent = "[ZoneTransfer]`r`nZoneId=3`r`n"
$zonePath = "${sourceFile}:Zone.Identifier"
Set-Content -Path $zonePath -Value $zoneContent -Encoding UTF8 -NoNewline

$paramsContent = "prompt=test, steps=20`r`n"
$paramsPath = "${sourceFile}:parameters"
Set-Content -Path $paramsPath -Value $paramsContent -Encoding UTF8 -NoNewline

Write-Host "Created fixture: $sourceFile"
Write-Host "  + Zone.Identifier"
Write-Host "  + parameters"
Write-Host ""
Write-Host "Manual copy test destination (create before ads:copy IPC test):"
Write-Host "  $(Join-Path $fixtureDir 'sample-copy-target.txt')"
