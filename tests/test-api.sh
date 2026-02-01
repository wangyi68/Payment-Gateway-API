#!/bin/bash
# ============================================================
# TheSieuToc API Test Script
# ============================================================

# Cấu hình
BASE_URL="http://localhost:3000"
API_URL="${BASE_URL}/api"

# Màu sắc
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}       TheSieuToc API Test Script${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# 1. Health Check
# ============================================================
echo -e "${YELLOW}[TEST 1] Health Check${NC}"
echo "GET ${BASE_URL}/health"
echo "---"
curl --silent --location "${BASE_URL}/health" | jq .
echo ""
echo ""

# ============================================================
# 2. Lấy chiết khấu (không cần API key)
# ============================================================
echo -e "${YELLOW}[TEST 2] Lấy chiết khấu${NC}"
echo "GET ${API_URL}/thesieutoc/discount"
echo "---"
curl --silent --location "${API_URL}/thesieutoc/discount" | jq .
echo ""
echo ""

# ============================================================
# 3. Gửi thẻ cào (Test validation - Serial/PIN sai format)
# ============================================================
echo -e "${YELLOW}[TEST 3] Gửi thẻ - Validation Error (Serial sai format)${NC}"
echo "POST ${API_URL}/thesieutoc"
echo "---"
curl --silent --location "${API_URL}/thesieutoc" \
  --header 'Content-Type: application/json' \
  --data '{
    "username": "test_user",
    "card_type": "Viettel",
    "card_amount": "50000",
    "serial": "123",
    "pin": "456"
  }' | jq .
echo ""
echo ""

# ============================================================
# 4. Gửi thẻ cào (Test với format đúng)
# ============================================================
echo -e "${YELLOW}[TEST 4] Gửi thẻ - Format đúng${NC}"
echo "POST ${API_URL}/thesieutoc"
echo "---"

# Tạo serial và pin ngẫu nhiên (format Viettel)
RANDOM_SERIAL="1234567890123"
RANDOM_PIN="123456789012345"
TRANSACTION_ID=""

RESPONSE=$(curl --silent --location "${API_URL}/thesieutoc" \
  --header 'Content-Type: application/json' \
  --data "{
    \"username\": \"test_user_$(date +%s)\",
    \"card_type\": \"Viettel\",
    \"card_amount\": \"50000\",
    \"serial\": \"${RANDOM_SERIAL}\",
    \"pin\": \"${RANDOM_PIN}\"
  }")

echo "$RESPONSE" | jq .

# Lấy transaction_id để test tiếp
TRANSACTION_ID=$(echo "$RESPONSE" | jq -r '.data.transaction_id // empty')
echo ""
echo -e "Transaction ID: ${GREEN}${TRANSACTION_ID}${NC}"
echo ""
echo ""

# ============================================================
# 5. Kiểm tra trạng thái thẻ
# ============================================================
if [ -n "$TRANSACTION_ID" ]; then
  echo -e "${YELLOW}[TEST 5] Kiểm tra trạng thái thẻ${NC}"
  echo "POST ${API_URL}/thesieutoc/status"
  echo "---"
  curl --silent --location "${API_URL}/thesieutoc/status" \
    --header 'Content-Type: application/json' \
    --data "{
      \"transaction_id\": \"${TRANSACTION_ID}\"
    }" | jq .
  echo ""
  echo ""
fi

# ============================================================
# 6. Lịch sử giao dịch
# ============================================================
echo -e "${YELLOW}[TEST 6] Lịch sử giao dịch${NC}"
echo "GET ${API_URL}/transaction/history?limit=5"
echo "---"
curl --silent --location "${API_URL}/transaction/history?limit=5" | jq .
echo ""
echo ""

# ============================================================
# 7. Test Callback (Giả lập callback từ TheSieuToc)
# ============================================================
if [ -n "$TRANSACTION_ID" ]; then
  echo -e "${YELLOW}[TEST 7] Callback - Thẻ thành công${NC}"
  echo "POST ${API_URL}/thesieutoc/callback (urlencoded)"
  echo "---"
  curl --silent --location "${API_URL}/thesieutoc/callback" \
    --data-urlencode "status=thanhcong" \
    --data-urlencode "serial=${RANDOM_SERIAL}" \
    --data-urlencode "pin=${RANDOM_PIN}" \
    --data-urlencode "card_type=Viettel" \
    --data-urlencode "amount=50000" \
    --data-urlencode "receive_amount=50000" \
    --data-urlencode "real_amount=42500" \
    --data-urlencode "noidung=Thẻ Thành Công" \
    --data-urlencode "content=${TRANSACTION_ID}" | jq .
  echo ""
  echo ""

  # Kiểm tra lại trạng thái sau callback
  echo -e "${YELLOW}[TEST 8] Kiểm tra trạng thái sau callback${NC}"
  echo "POST ${API_URL}/thesieutoc/status"
  echo "---"
  curl --silent --location "${API_URL}/thesieutoc/status" \
    --header 'Content-Type: application/json' \
    --data "{
      \"transaction_id\": \"${TRANSACTION_ID}\"
    }" | jq .
  echo ""
  echo ""
fi

# ============================================================
# 8. Test Callback - Sai mệnh giá
# ============================================================
echo -e "${YELLOW}[TEST 9] Gửi thẻ mới để test sai mệnh giá${NC}"
RANDOM_SERIAL2="9876543210123"
RANDOM_PIN2="987654321012345"

RESPONSE2=$(curl --silent --location "${API_URL}/thesieutoc" \
  --header 'Content-Type: application/json' \
  --data "{
    \"username\": \"test_saimenhgia_$(date +%s)\",
    \"card_type\": \"Viettel\",
    \"card_amount\": \"100000\",
    \"serial\": \"${RANDOM_SERIAL2}\",
    \"pin\": \"${RANDOM_PIN2}\"
  }")

echo "$RESPONSE2" | jq .
TRANSACTION_ID2=$(echo "$RESPONSE2" | jq -r '.data.transaction_id // empty')
echo ""

if [ -n "$TRANSACTION_ID2" ]; then
  echo -e "${YELLOW}[TEST 10] Callback - Sai mệnh giá${NC}"
  echo "POST ${API_URL}/thesieutoc/callback"
  echo "---"
  curl --silent --location "${API_URL}/thesieutoc/callback" \
    --data-urlencode "status=saimenhgia" \
    --data-urlencode "serial=${RANDOM_SERIAL2}" \
    --data-urlencode "pin=${RANDOM_PIN2}" \
    --data-urlencode "card_type=Viettel" \
    --data-urlencode "amount=50000" \
    --data-urlencode "receive_amount=50000" \
    --data-urlencode "real_amount=42500" \
    --data-urlencode "noidung=Thẻ sai mệnh giá (khai 100k, thực 50k)" \
    --data-urlencode "content=${TRANSACTION_ID2}" | jq .
  echo ""
  echo ""
fi

# ============================================================
# 9. Test Callback - Thất bại
# ============================================================
echo -e "${YELLOW}[TEST 11] Gửi thẻ mới để test thất bại${NC}"
RANDOM_SERIAL3="5555555555555"
RANDOM_PIN3="666666666666666"

RESPONSE3=$(curl --silent --location "${API_URL}/thesieutoc" \
  --header 'Content-Type: application/json' \
  --data "{
    \"username\": \"test_thatbai_$(date +%s)\",
    \"card_type\": \"Viettel\",
    \"card_amount\": \"50000\",
    \"serial\": \"${RANDOM_SERIAL3}\",
    \"pin\": \"${RANDOM_PIN3}\"
  }")

echo "$RESPONSE3" | jq .
TRANSACTION_ID3=$(echo "$RESPONSE3" | jq -r '.data.transaction_id // empty')
echo ""

if [ -n "$TRANSACTION_ID3" ]; then
  echo -e "${YELLOW}[TEST 12] Callback - Thất bại${NC}"
  echo "POST ${API_URL}/thesieutoc/callback"
  echo "---"
  curl --silent --location "${API_URL}/thesieutoc/callback" \
    --data-urlencode "status=thatbai" \
    --data-urlencode "serial=${RANDOM_SERIAL3}" \
    --data-urlencode "pin=${RANDOM_PIN3}" \
    --data-urlencode "card_type=Viettel" \
    --data-urlencode "amount=50000" \
    --data-urlencode "receive_amount=0" \
    --data-urlencode "real_amount=0" \
    --data-urlencode "noidung=Thẻ sai" \
    --data-urlencode "content=${TRANSACTION_ID3}" | jq .
  echo ""
  echo ""
fi

# ============================================================
# Kết quả cuối cùng
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${GREEN}✅ Test hoàn tất!${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "Kiểm tra các file log:"
echo "  - logs/combined.log"
echo "  - logs/thesieutoc.log"
echo "  - logs/thesieutoc_success.log (thẻ thành công)"
echo ""
