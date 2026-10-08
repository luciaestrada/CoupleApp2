param([switch]$Check)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Instala Node.js para compilar la app.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules\expo\package.json'))) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
    }
    if ($Check) { & node scripts/android-release.mjs apk --check }
    else { & node scripts/android-release.mjs apk }
    if ($LASTEXITCODE -ne 0) { throw 'La compilación o la comprobación de firma ha fallado. Revisa el error anterior.' }
} finally {
    Pop-Location
}
