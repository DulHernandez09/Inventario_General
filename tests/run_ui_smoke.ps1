# Ejecuta tests/ui_smoke.html con Edge sin ventana y muestra el resultado.   Uso: powershell -File tests\run_ui_smoke.ps1
$root = Split-Path -Parent $PSScriptRoot
$edge = @("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "C:\Program Files\Microsoft\Edge\Application\msedge.exe", "C:\Program Files\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$out = Join-Path $env:TEMP "ui_smoke_dom.html"
if (Test-Path $out) { Remove-Item $out }
$url = "file:///" + ((Join-Path $root "tests\ui_smoke.html") -replace '\\', '/' -replace ' ', '%20')
$p = Start-Process $edge -ArgumentList "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--user-data-dir=$env:TEMP\edge_smoke_prof", "--virtual-time-budget=30000", "--dump-dom", $url -RedirectStandardOutput $out -PassThru -WindowStyle Hidden
$p | Wait-Process -Timeout 120 -ErrorAction SilentlyContinue
if (-not $p.HasExited) { Stop-Process $p -Force }
$html = Get-Content $out -Raw -Encoding utf8
$m = [regex]::Match($html, '<pre id="result">([\s\S]*?)</pre>')
if (-not $m.Success) { Write-Host "No se obtuvo resultado"; exit 1 }
$txt = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
Write-Host $txt
if ($txt -match 'RESULTADO: OK') { exit 0 } else { exit 1 }
