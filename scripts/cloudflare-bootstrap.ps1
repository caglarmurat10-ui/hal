$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail([string]$message) {
  Write-Host "`nHATA: $message" -ForegroundColor Red
  exit 1
}

function Run([string]$label, [scriptblock]$command) {
  Write-Host "`n== $label ==" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE -ne 0) { Fail "$label basarisiz oldu." }
}

function New-SecureToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-ObjectProperty([object]$object, [string]$name) {
  if (-not $object) { return "" }
  $prop = $object.PSObject.Properties[$name]
  if (-not $prop -or $null -eq $prop.Value) { return "" }
  return [string]$prop.Value
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js bulunamadi." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm bulunamadi." }

$lockPath = Join-Path $root "package-lock.json"
if (Test-Path $lockPath) {
  Run "Bagimliliklar kuruluyor (npm ci)" { npm ci }
} else {
  Write-Host "`npackage-lock.json yok; npm install kullaniliyor." -ForegroundColor Yellow
  Run "Bagimliliklar kuruluyor (npm install)" { npm install --no-package-lock }
}

Write-Host "`n== Cloudflare oturumu kontrol ediliyor ==" -ForegroundColor Cyan
& npx wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cloudflare oturumu acilacak. Tarayicidaki yetkilendirmeyi tamamlayin." -ForegroundColor Yellow
  & npx wrangler login
  if ($LASTEXITCODE -ne 0) { Fail "Cloudflare oturumu acilamadi." }
}

$configPath = Join-Path $root "wrangler.jsonc"
$config = Get-Content $configPath -Raw
$placeholder = "REPLACE_WITH_D1_DATABASE_ID"
$databaseName = "hal-takip-db"

if ($config.Contains($placeholder)) {
  Write-Host "`n== D1 veritabani hazirlaniyor ==" -ForegroundColor Cyan
  $listJson = (& npx wrangler d1 list --json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { Fail "D1 listesi okunamadi." }
  $databases = $listJson | ConvertFrom-Json
  $db = @($databases) | Where-Object { (Get-ObjectProperty $_ "name") -eq $databaseName } | Select-Object -First 1

  if (-not $db) {
    Write-Host "$databaseName bulunamadi; Eastern Europe konum ipucuyla olusturuluyor." -ForegroundColor Yellow
    & npx wrangler d1 create $databaseName --location eeur
    if ($LASTEXITCODE -ne 0) { Fail "D1 olusturulamadi." }
    $listJson = (& npx wrangler d1 list --json 2>$null | Out-String)
    if ($LASTEXITCODE -ne 0) { Fail "Yeni D1 listesi okunamadi." }
    $databases = $listJson | ConvertFrom-Json
    $db = @($databases) | Where-Object { (Get-ObjectProperty $_ "name") -eq $databaseName } | Select-Object -First 1
  }

  if (-not $db) { Fail "$databaseName olusturulduktan sonra listede bulunamadi." }
  $databaseId = Get-ObjectProperty $db "uuid"
  if (-not $databaseId) { $databaseId = Get-ObjectProperty $db "id" }
  if (-not $databaseId) { Fail "$databaseName database ID degeri bulunamadi." }

  $config = $config.Replace($placeholder, $databaseId)
  Set-Content -Path $configPath -Value $config -Encoding UTF8
  Write-Host "D1 baglandi: $databaseName / $databaseId" -ForegroundColor Green
} else {
  Write-Host "`nD1 database_id zaten wrangler.jsonc icinde tanimli." -ForegroundColor Green
}

$oldCI = $env:CI
$env:CI = "true"
try {
  Run "D1 migrationlari uygulaniyor" { npx wrangler d1 migrations apply $databaseName --remote }
} finally {
  $env:CI = $oldCI
}

Write-Host "`n== D1 temiz baslangic dogrulamasi ==" -ForegroundColor Cyan
$check = (& npx wrangler d1 execute $databaseName --remote --command "SELECT (SELECT COUNT(*) FROM sales) AS sales_count, (SELECT COUNT(*) FROM payments) AS payments_count;" --json 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { Fail "D1 dogrulama sorgusu basarisiz oldu." }
Write-Host $check
$compactCheck = $check -replace '\s', ''
if ($compactCheck -notmatch '"sales_count":0' -or $compactCheck -notmatch '"payments_count":0') {
  Fail "D1 bos degil. Temiz baslangic kurali nedeniyle mevcut veriye dokunmadan islem durduruldu."
}
Write-Host "D1 bos: 0 satis, 0 tahsilat." -ForegroundColor Green

$apiKey = New-SecureToken
$devVarsPath = Join-Path $root ".dev.vars"
"HAL_API_KEY=$apiKey" | Set-Content -Path $devVarsPath -Encoding UTF8

Write-Host "`n== HAL_API_KEY yukleniyor ==" -ForegroundColor Cyan
$apiKey | npx wrangler secret put HAL_API_KEY
if ($LASTEXITCODE -ne 0) { Fail "HAL_API_KEY yuklenemedi." }

Write-Host "`n== Worker deploy ediliyor ==" -ForegroundColor Cyan
# Windows PowerShell, native stderr satirlarini ErrorRecord olarak yorumlayabilir.
# npm/wrangler uyarilarini cmd.exe icinde stdout'a birlestirerek gercek cikis kodunu koruyoruz.
$deployLines = & cmd.exe /d /s /c "npm run deploy 2^>^&1"
$deployExit = $LASTEXITCODE
$deployOutput = ($deployLines | Out-String)
Write-Host $deployOutput
if ($deployExit -ne 0) { Fail "Worker deploy basarisiz oldu (exit $deployExit)." }

$match = [regex]::Match($deployOutput, 'https://[A-Za-z0-9.-]+\.workers\.dev')
$workerUrl = if ($match.Success) { $match.Value.TrimEnd('/') } else { "" }

if ($workerUrl) {
  Write-Host "`n== Health kontrolu ==" -ForegroundColor Cyan
  try {
    $health = Invoke-RestMethod -Uri "$workerUrl/api/health" -Method Get -TimeoutSec 20
    Write-Host "Worker saglikli: $($health.service)" -ForegroundColor Green
  } catch {
    Write-Host "Worker deploy edildi ancak otomatik health kontrolu basarisiz: $($_.Exception.Message)" -ForegroundColor Yellow
  }
} else {
  Write-Host "Worker URL otomatik bulunamadi; wrangler deploy ciktisini kontrol edin." -ForegroundColor Yellow
}

$localInfoPath = Join-Path $root ".hal-cloudflare.local.txt"
@(
  "HAL Takip Cloudflare baglanti bilgileri",
  "Bu dosyayi paylasmayin ve repoya eklemeyin.",
  "",
  "API_BASE_URL=$workerUrl",
  "HAL_API_KEY=$apiKey"
) | Set-Content -Path $localInfoPath -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "HAL Cloudflare temiz kurulum tamamlandi." -ForegroundColor Green
if ($workerUrl) { Write-Host "API adresi: $workerUrl" }
Write-Host "D1 baslangici: 0 satis / 0 tahsilat" -ForegroundColor Green
Write-Host "Baglanti bilgileri: $localInfoPath" -ForegroundColor Yellow
Write-Host "Bu bilgiler HAL Takip > Ayarlar ekranina bir kez girilecek." -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Green
