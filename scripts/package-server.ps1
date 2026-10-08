param([string]$OutputPath = (Join-Path $PSScriptRoot '..\coupleapp-server-repair.zip'))
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ('coupleapp-server-' + [guid]::NewGuid())
try {
    New-Item -ItemType Directory -Path (Join-Path $staging 'scripts') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $staging 'supabase') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $staging 'docs') -Force | Out-Null
    foreach ($name in @('repair-server.sh', 'server-diagnostics.sql')) {
        # Normalize Unix line endings so Bash can execute after Windows packaging.
        $content = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $name)).Replace("`r`n", "`n")
        [System.IO.File]::WriteAllText((Join-Path $staging "scripts\$name"), $content, [System.Text.UTF8Encoding]::new($false))
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase\functions') -Destination (Join-Path $staging 'supabase') -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase\migrations') -Destination (Join-Path $staging 'supabase') -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'docs\SERVER_REPAIR.md') -Destination (Join-Path $staging 'LEEME.md')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'docs\IMPLEMENTACION_ESTADO.md') -Destination (Join-Path $staging 'docs')
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipStream = [System.IO.File]::Open([System.IO.Path]::GetFullPath($OutputPath), [System.IO.FileMode]::Create)
    $zip = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $staging -File -Recurse) {
            $relativeName = $file.FullName.Substring($staging.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relativeName) | Out-Null
        }
    } finally {
        $zip.Dispose()
        $zipStream.Dispose()
    }
    Write-Output ([System.IO.Path]::GetFullPath($OutputPath))
} finally {
    $resolvedStaging = [System.IO.Path]::GetFullPath($staging)
    $temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedStaging.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path $resolvedStaging -Leaf).StartsWith('coupleapp-server-')) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
