# ============================================================
# TheSieuToc API Test Script (PowerShell)
# ============================================================

$BaseUrl = "https://glottologic-nonoperatic-hulda.ngrok-free.dev"
$ApiUrl = "$BaseUrl/api"

# Header de bypass ngrok browser warning
$Headers = @{
    "ngrok-skip-browser-warning" = "true"
}

Write-Host "============================================================" -ForegroundColor Blue
Write-Host "       TheSieuToc API Test Script" -ForegroundColor Blue
Write-Host "============================================================" -ForegroundColor Blue
Write-Host ""

# ============================================================
# 1. Health Check
# ============================================================
Write-Host "[TEST 1] Health Check" -ForegroundColor Yellow
Write-Host "GET $BaseUrl/health"
Write-Host "---"
$response = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -Headers $Headers
$response | ConvertTo-Json -Depth 10
Write-Host ""

# ============================================================
# 2. Lay chiet khau
# ============================================================
Write-Host "[TEST 2] Lay chiet khau" -ForegroundColor Yellow
Write-Host "GET $ApiUrl/thesieutoc/discount"
Write-Host "---"
$response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc/discount" -Method Get -Headers $Headers
$response | ConvertTo-Json -Depth 10
Write-Host ""

# ============================================================
# 3. Gui the - Validation Error
# ============================================================
Write-Host "[TEST 3] Gui the - Validation Error (Serial sai format)" -ForegroundColor Yellow
Write-Host "POST $ApiUrl/thesieutoc"
Write-Host "---"
$body = @{
    username    = "test_user"
    card_type   = "Viettel"
    card_amount = "50000"
    serial      = "123"
    pin         = "456"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc" -Method Post -Body $body -ContentType "application/json" -Headers $Headers
    $response | ConvertTo-Json -Depth 10
}
catch {
    Write-Host $_.ErrorDetails.Message -ForegroundColor Red
}
Write-Host ""

# ============================================================
# 4. Gui the - Format dung
# ============================================================
Write-Host "[TEST 4] Gui the - Format dung" -ForegroundColor Yellow
Write-Host "POST $ApiUrl/thesieutoc"
Write-Host "---"

$randomSerial = "1234567890123"
$randomPin = "123456789012345"
$timestamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()

$body = @{
    username    = "test_user_$timestamp"
    card_type   = "Viettel"
    card_amount = "50000"
    serial      = $randomSerial
    pin         = $randomPin
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc" -Method Post -Body $body -ContentType "application/json" -Headers $Headers
    $response | ConvertTo-Json -Depth 10
    $transactionId = $response.data.transaction_id
    Write-Host "Transaction ID: $transactionId" -ForegroundColor Green
}
catch {
    Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    $transactionId = $null
}
Write-Host ""

# ============================================================
# 5. Kiem tra trang thai the
# ============================================================
if ($transactionId) {
    Write-Host "[TEST 5] Kiem tra trang thai the" -ForegroundColor Yellow
    Write-Host "POST $ApiUrl/thesieutoc/status"
    Write-Host "---"
    $body = @{
        transaction_id = $transactionId
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc/status" -Method Post -Body $body -ContentType "application/json" -Headers $Headers
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
}

# ============================================================
# 6. Lich su giao dich
# ============================================================
Write-Host "[TEST 6] Lich su giao dich" -ForegroundColor Yellow
Write-Host "GET $ApiUrl/transaction/history?limit=5"
Write-Host "---"
$response = Invoke-RestMethod -Uri "$ApiUrl/transaction/history?limit=5" -Method Get -Headers $Headers
$response | ConvertTo-Json -Depth 10
Write-Host ""

# ============================================================
# 7. Test Callback - Thanh cong
# ============================================================
if ($transactionId) {
    Write-Host "[TEST 7] Callback - The thanh cong" -ForegroundColor Yellow
    Write-Host "POST $ApiUrl/thesieutoc/callback (urlencoded)"
    Write-Host "---"
    
    $callbackBody = "status=thanhcong&serial=$randomSerial&pin=$randomPin&card_type=Viettel&amount=50000&receive_amount=50000&real_amount=42500&noidung=The+Thanh+Cong&content=$transactionId"
    
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc/callback" -Method Post -Body $callbackBody -ContentType "application/x-www-form-urlencoded" -Headers $Headers
        $response | ConvertTo-Json -Depth 10
    }
    catch {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    Write-Host ""
    
    # Kiem tra lai trang thai
    Write-Host "[TEST 8] Kiem tra trang thai sau callback" -ForegroundColor Yellow
    $body = @{
        transaction_id = $transactionId
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc/status" -Method Post -Body $body -ContentType "application/json" -Headers $Headers
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
}

# ============================================================
# Ket qua
# ============================================================
Write-Host "============================================================" -ForegroundColor Blue
Write-Host "Test hoan tat!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Kiem tra cac file log:"
Write-Host "  - logs/combined.log"
Write-Host "  - logs/thesieutoc.log"
Write-Host "  - logs/thesieutoc_success.log (the thanh cong)"
Write-Host ""
