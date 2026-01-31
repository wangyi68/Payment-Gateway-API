# Tài liệu API - Payment Gateway

Tài liệu này liệt kê toàn bộ các API Endpoints hiện có trong hệ thống, bao gồm Nạp thẻ cào (TheSieuToc), Chuyển khoản QR (PayOS), Quản lý giao dịch và Hệ thống.

## 1. Module Thẻ Cào (Card Top-up)

Quản lý việc gửi thẻ cào, lấy chiết khấu và nhận callback từ provider TheSieuToc.

### 1.1 Gửi thẻ cào
- **Endpoint:** `POST /api/card`
- **Mô tả:** Gửi thông tin thẻ cào lên hệ thống để xử lý.
- **Body (JSON):**
  ```json
  {
    "username": "tên_người_dùng",
    "card_type": "Viettel",
    "card_amount": "10000",
    "pin": "1234567890123",
    "serial": "100012345678"
  }
  ```
- **Phản hồi:** Trả về mã giao dịch (`transaction_id`) để theo dõi.

### 1.2 Lấy chiết khấu thẻ
- **Endpoint:** `GET /api/card/discount/:account?`
- **Mô tả:** Lấy bảng chiết khấu hiện tại của các loại thẻ.
- **Tham số:** `:account` (không bắt buộc) - Tên tài khoản để lấy chiết khấu riêng (nếu có).

### 1.3 Kiểm tra trạng thái thẻ
- **Endpoint:** `POST /api/card/status`
- **Mô tả:** Kiểm tra trạng thái của một thẻ đã gửi dựa trên `transaction_id`.
- **Body (JSON):**
  ```json
  {
    "transaction_id": "Mã_giao_dịch_của_bạn"
  }
  ```

### 1.4 Provider Callback (TheSieuToc)
- **Endpoint:** `POST /api/card/callback`
- **Mô tả:** Endpoint dành cho TheSieuToc gọi về khi thẻ xử lý xong.
- **Bảo mật:** Tự động xác thực dữ liệu qua mã PIN/Serial đối chiếu trong DB.

---

## 2. Module Thanh Toán QR (PayOS)

Quản lý việc tạo link thanh toán VietQR và xử lý webhook.

### 2.1 Tạo link thanh toán
- **Endpoint:** `POST /api/payos/checkout`
- **Mô tả:** Tạo link thanh toán VietQR mới.
- **Body (JSON):**
  ```json
  {
    "orderCode": 123456,
    "amount": 50000,
    "description": "Nạp tiền game",
    "returnUrl": "https://your-site.com/success",
    "cancelUrl": "https://your-site.com/cancel"
  }
  ```

### 2.2 Lấy thông tin thanh toán (PayOS API)
- **Endpoint:** `GET /api/payos/payment-info/:orderCode`
- **Mô tả:** Lấy thông tin chi tiết thanh toán trực tiếp từ hệ thống PayOS.

### 2.3 Tra cứu đơn hàng (Local DB)
- **Endpoint:** `GET /api/payos/orders/:orderCode`
- **Mô tả:** Tra cứu trạng thái đơn hàng PayOS đã lưu trong database của server.

### 2.4 Webhook Callback
- **Endpoint:** `POST /api/payos/callback`
- **Mô tả:** Nhận webhook thông báo thanh toán thành công từ PayOS.
- **Bảo mật:** Kiểm tra Signature (HMAC SHA256) cực kỳ chặt chẽ, chống giả mạo 100%.

---

## 3. Quản lý Giao dịch (Transaction Management)

### 3.1 Lịch sử giao dịch
- **Endpoint:** `GET /api/transaction/history`
- **Mô tả:** Lấy danh sách 50 giao dịch thành công gần nhất.

### 3.2 Tìm kiếm giao dịch
- **Endpoint:** `GET /api/transaction/search?query=...`
- **Mô tả:** Tìm kiếm giao dịch theo tên người dùng, serial thẻ hoặc mã đơn hàng.

### 3.3 Chi tiết log giao dịch
- **Endpoint:** `GET /api/transaction/:id/logs`
- **Mô tả:** Xem chi tiết log hệ thống và raw data của một giao dịch cụ thể.

---

## 4. Hệ thống & Sức khỏe (System & Health)

Các endpoint kỹ thuật để giám sát server.

- `GET /api/system/info`: Thông tin tổng quan về server (Uptime, Memory, Platform).
- `GET /api/system/health`: Kiểm tra sức khỏe toàn diện (DB, Queue, Scheduler).
- `GET /api/system/health/ping`: Phản hồi nhanh 'pong' để check alive.
- `GET /api/system/health/version`: Lấy phiên bản code hiện tại.

---

## Ghi chú chung
1.  **Chống Spam:** Các endpoint nhạy cảm (`/api/card`, `/api/payos/checkout`) được bảo vệ bởi **Strict Rate Limiter**.
2.  **Định dạng dữ liệu:** Mọi yêu cầu và phản hồi đều sử dụng `application/json`.
3.  **Mã trạng thái:**
    *   `0`: PENDING (Đang chờ)
    *   `1`: SUCCESS (Thành công)
    *   `2`: FAILED (Thất bại)
    *   `3`: WRONG_AMOUNT (Sai mệnh giá)
