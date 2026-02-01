# ============================================================
# TheSieuToc REAL CARD Testing Tool (PowerShell)
# ============================================================

# Cau hinh URL mac dinh (uu tien Ngrok neu co, khong thi localhost)
$BaseUrl = "https://glottologic-nonoperatic-hulda.ngrok-free.dev"
$ApiUrl = "$BaseUrl/api"

# Header bypass browser warning
$Headers = @{
    "ngrok-skip-browser-warning" = "true"
}

Function Show-Menu {
    param (
        [string]$Title,
        [string[]]$Options
    )
    Write-Host "`n=== $Title ===" -ForegroundColor Cyan
    for ($i = 0; $i -lt $Options.Count; $i++) {
        Write-Host "$($i + 1). $($Options[$i])"
    }
    $selection = Read-Host "Chon (1-$($Options.Count))"
    return $Options[$selection - 1]
}

# ============================================================
# Workflow Nap The That
# ============================================================

Clear-Host
Write-Host "============================================================" -ForegroundColor Blue
Write-Host "       TOOL TEST NAP THE THAT - TheSieuToc API" -ForegroundColor Blue
Write-Host "============================================================" -ForegroundColor Blue
Write-Host "URL API: $BaseUrl" -ForegroundColor Gray
Write-Host ""

# 1. Nhap thong tin nguoi dung
$Username = Read-Host "Nhap Username quan ly (mac dinh: admin_test)"
if ([string]::IsNullOrWhiteSpace($Username)) { $Username = "admin_test" }

# 2. Chon Loai the
$CardTypes = @("Viettel", "Mobifone", "Vinaphone", "Vietnamobile", "Zing", "Gate", "Garena", "Vcoin")
$CardType = Show-Menu -Title "Chon Nha Mang/Loai The" -Options $CardTypes
if ([string]::IsNullOrWhiteSpace($CardType)) { Write-Host "Loi: Chua chon loai the." -ForegroundColor Red; exit }

# 3. Chon Menh gia
$Amounts = @("10000", "20000", "30000", "50000", "100000", "200000", "300000", "500000", "1000000")
$CardAmount = Show-Menu -Title "Chon Menh Gia" -Options $Amounts
if ([string]::IsNullOrWhiteSpace($CardAmount)) { Write-Host "Loi: Chua chon menh gia." -ForegroundColor Red; exit }

# 4. Nhap Serial va PIN
Write-Host "`n--- Nhap thong tin the ---" -ForegroundColor Yellow
$Serial = Read-Host "Nhap So Serial"
$Pin = Read-Host "Nhap Ma The (PIN)"

if ([string]::IsNullOrWhiteSpace($Serial) -or [string]::IsNullOrWhiteSpace($Pin)) {
    Write-Host "Loi: Serial va PIN khong duoc de trong!" -ForegroundColor Red
    exit
}

# 5. Xac nhan
Write-Host "`n--- XAC NHAN THONG TIN ---" -ForegroundColor Yellow
Write-Host "User:      $Username"
Write-Host "Loai the:  $CardType"
Write-Host "Menh gia:  $CardAmount"
Write-Host "Serial:    $Serial"
Write-Host "PIN:       $Pin"
Write-Host "--------------------------"
$Confirm = Read-Host "Ban co chac chan muon gui the nay? (y/n)"
if ($Confirm -ne 'y') { Write-Host "Da huy."; exit }

# 6. Gui API Request
Write-Host "`nDang gui request..." -ForegroundColor Cyan

$body = @{
    username    = $Username
    card_type   = $CardType
    card_amount = $CardAmount
    serial      = $Serial
    pin         = $Pin
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc" -Method Post -Body $body -ContentType "application/json" -Headers $Headers
    
    if ($response.success) {
        Write-Host "`n[OK] GUI THE THANH CONG!" -ForegroundColor Green
        Write-Host "Message: $($response.message)"
        Write-Host "Transaction ID: $($response.data.transaction_id)" -ForegroundColor Green
        
        $transId = $response.data.transaction_id

        # 7. Tu dong kiem tra trang thai
        Write-Host "`nDang theo doi trang thai the (Ctrl+C de thoat)..." -ForegroundColor Yellow
        
        for ($i = 1; $i -le 10; $i++) {
            Start-Sleep -Seconds 5
            Write-Host "[$i] Checking status..." -NoNewline
            
            $statusBody = @{ transaction_id = $transId } | ConvertTo-Json
            try {
                $statusRes = Invoke-RestMethod -Uri "$ApiUrl/thesieutoc/status" -Method Post -Body $statusBody -ContentType "application/json" -Headers $Headers
                
                $remoteStatus = $statusRes.data.api_status_text
                $localStatus = $statusRes.data.local.status_text
                
                Write-Host " -> Server: $remoteStatus | Local: $localStatus"
                
                if ($statusRes.data.local.status -eq 1) {
                    # Thanh cong
                    Write-Host "`n[SUCCESS] THE NAP THANH CONG! KIEM TRA LOG." -ForegroundColor Green
                    break
                }
                elseif ($statusRes.data.local.status -eq 2 -or $statusRes.data.local.status -eq 3) {
                    # That bai hoac Sai menh gia
                    Write-Host "`n[FAILED] THE LOI HOAC SAI MENH GIA." -ForegroundColor Red
                    break
                }
            }
            catch {
                Write-Host " Loi check status."
            }
        }
    }
    else {
        Write-Host "`n[ERROR] GUI THE THAT BAI!" -ForegroundColor Red
        Write-Host "Error: $($response.error)"
        Write-Host "Message: $($response.message)"
    }

}
catch {
    Write-Host "`n[ERROR] LOI KET NOI HOAC SERVER ERROR" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Response Body: $($reader.ReadToEnd())"
    }
}

Write-Host "`nKet thuc."
