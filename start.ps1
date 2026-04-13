param(
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cacheDir = Join-Path $root '.cache/huggingface'
$pythonUnix = Join-Path $root '.venv/bin/python'
$pythonWindows = Join-Path $root '.venv/Scripts/python.exe'

$env:CLICKBAIT_MODEL_CACHE = $cacheDir
$env:HF_HOME = $cacheDir
$env:TRANSFORMERS_CACHE = $cacheDir
$env:SENTENCE_TRANSFORMERS_HOME = $cacheDir
$env:TRANSFORMERS_NO_TORCHVISION = '1'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:HF_HUB_DISABLE_PROGRESS_BARS = '1'

if ($Offline) {
    $env:HF_HUB_OFFLINE = '1'
}

if (Test-Path $pythonUnix) {
    & $pythonUnix (Join-Path $root 'app.py')
    exit $LASTEXITCODE
}

if (Test-Path $pythonWindows) {
    & $pythonWindows (Join-Path $root 'app.py')
    exit $LASTEXITCODE
}

throw 'No project Python interpreter found in .venv.'