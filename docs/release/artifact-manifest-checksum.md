# Release Artifact Manifest and Checksum Flow

## Scope
This SOP defines deterministic artifact naming, checksum generation, and publication verification for desktop release distribution.

## Naming Convention
- Release tag format: `v<major>.<minor>.<patch>` (for example `v1.4.0`).
- Artifact filename format: `aih-<version>-<platform>-<arch>.<ext>`.
- Allowed platform values: `windows`, `macos`, `linux`.
- Allowed arch values: `x64`, `arm64`.
- Extension examples:
  - Windows installer: `.exe` or `.msi`
  - macOS package: `.dmg` or `.pkg`
  - Linux package: `.AppImage`, `.deb`, `.rpm`

Example release set:
- `aih-1.4.0-windows-x64.exe`
- `aih-1.4.0-macos-arm64.dmg`
- `aih-1.4.0-linux-x64.AppImage`

## Required Output Files
For each release tag, produce and publish:
- One artifact manifest: `manifest-v<version>.txt`
- One checksum bundle: `checksums-v<version>.sha256`

Manifest file format (one line per artifact):
- `<filename>\t<bytes>\t<mime-type>`

Checksum file format (SHA256SUM compatible):
- `<sha256><two spaces><filename>`

## Hash Generation
Run from the directory containing final release artifacts.

Linux/macOS:
```bash
ls -1 aih-* > manifest-v1.4.0.txt
awk '{ cmd = "stat -f%z \"" $0 "\""; cmd | getline size; close(cmd); print $0 "\t" size "\tapplication/octet-stream"; }' manifest-v1.4.0.txt > manifest-v1.4.0.tmp
mv manifest-v1.4.0.tmp manifest-v1.4.0.txt
shasum -a 256 aih-* > checksums-v1.4.0.sha256
```

Windows PowerShell:
```powershell
Get-ChildItem aih-* | Sort-Object Name | ForEach-Object {
  "$($_.Name)`t$($_.Length)`tapplication/octet-stream"
} | Out-File -Encoding utf8 manifest-v1.4.0.txt

Get-ChildItem aih-* | Sort-Object Name | Get-FileHash -Algorithm SHA256 | ForEach-Object {
  "$($_.Hash.ToLower())  $($_.Path | Split-Path -Leaf)"
} | Out-File -Encoding ascii checksums-v1.4.0.sha256
```

## Publication Flow
1. Upload all release artifacts to the distribution endpoint (GitHub Release, object storage, or mirror).
2. Upload `manifest-v<version>.txt` and `checksums-v<version>.sha256` to the same location.
3. Attach both files in release notes under "Integrity Metadata".
4. Record publication timestamp and operator in release log.

## Consumer Verification
After download, users verify file integrity with published checksum bundle.

Linux/macOS:
```bash
shasum -a 256 -c checksums-v1.4.0.sha256
```

Windows PowerShell:
```powershell
$pairs = Get-Content checksums-v1.4.0.sha256 | ForEach-Object {
  if ($_ -match '^([a-f0-9]{64})\s{2}(.+)$') { [PSCustomObject]@{ Hash = $Matches[1]; File = $Matches[2] } }
}
foreach ($p in $pairs) {
  $actual = (Get-FileHash $p.File -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $p.Hash) { throw "Checksum mismatch: $($p.File)" }
}
Write-Host "All checksums match."
```

Expected result:
- Every artifact passes checksum verification.
- Any mismatch blocks release announcement until corrected and re-published.

## Release Gate
- [ ] Artifact filenames comply with deterministic naming rule.
- [ ] `manifest-v<version>.txt` includes every published artifact.
- [ ] `checksums-v<version>.sha256` includes every published artifact.
- [ ] Independent verifier confirms checksum pass on a clean machine.
- [ ] Release notes include links to manifest and checksum files.
