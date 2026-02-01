# 📚 Payment Gateway API Documentation

Tài liệu chi tiết về các endpoints của hệ thống Payment Gateway.

## 🔐 Xác thực & Bảo mật (Authentication & Security)

Hệ thống sử dụng cơ chế bảo mật đa lớp:

1.  **API Key Auth**:
    *   Áp dụng cho các endpoint nhạy cảm (Gửi thẻ, Tạo link thanh toán, Tra cứu).
    *   **Header Key**: `x-api-key` hoặc `Authorization`.
    *   **Value**: Giá trị `API_SECRET_KEY` trong file cấu hình `.env`.
2.  **Rate Limiting**:
    *   Giới hạn **5 request/phút** cho các tác vụ ghi (POST) từ cùng một IP.
    *   Giới hạn **100 request/phút** cho các tác vụ đọc (GET).
3.  **Data Protection**:
    *   Ẩn mã thẻ (PIN) và Serial trong log và API response.
    *   Sử dụng Prepared Statements chống SQL Injection.

---

## 1. Module TheSieuToc (Card Mobile)

Base URL: `/api/thesieutoc`

### 1.1 Gửi thẻ cào (Submit Card)
Gửi thông tin thẻ cào lên hệ thống để xử lý gạch thẻ.

- **Endpoint**: `POST /api/thesieutoc`
- **Auth**: ✅ Required
- **Rate Limit**: ✅ Strict
- **Body (JSON)**:
    ```json
    {
      "username": "user123",        // Tên người dùng/Đại lý gửi thẻ
      "card_type": "Viettel",       // Viettel, Vinaphone, Mobifone, Vietnamobile, Zing
      "card_amount": "10000",       // Mệnh giá khai báo (10000, 20000...)
      "pin": "1234567890123",       // Mã thẻ
      "serial": "100012345678",     // Số serial
      "request_id": "req_001"       // (Optional) Mã request riêng của client
    }
    ```
- **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Gửi thẻ thành công",
      "data": {
        "transaction_id": "TRANS_1706789...", // Mã giao dịch của hệ thống
        "status": 0,                          // 0: PENDING
        "status_text": "PENDING"
      }
    }
    ```

### 1.2 Lấy bảng chiết khấu (Get Discount)
Lấy bảng chiết khấu % thực nhận hiện tại từ TheSieuToc.

- **Endpoint**: `GET /api/thesieutoc/discount/:account?`
- **Auth**: ❌ Optional (Công khai)
- **Params**:
    - `account`: (Optional) Tên tài khoản cụ thể để lấy mức chiết khấu riêng.
- **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": [
        {
          "type": "Viettel",
          "value": 10000,
          "fees": 12.5,       // Phí gạch thẻ (%)
          "penalty": 50       // Phạt sai mệnh giá (%)
        },
        ...
      ]
    }
    ```

### 1.3 Kiểm tra trạng thái thẻ (Check Status)
Chủ động kiểm tra trạng thái thẻ dựa trên mã giao dịch.

- **Endpoint**: `POST /api/thesieutoc/status`
- **Auth**: ✅ Required
- **Body**:
    ```json
    { "transaction_id": "TRANS_1706789..." }
    ```
- **Response**:
    ```json
    {
      "success": true,
      "data": {
        "transaction_id": "TRANS_1706789...",
        "status": 1,              // 1: SUCCESS, 2: FAILED, 3: WRONG_AMOUNT
        "amount": 10000,          // Mệnh giá thực
        "real_amount": 8750       // Thực nhận
      }
    }
    ```

### 1.4 Webhook Callback
Endpoint dành cho TheSieuToc gọi về để thông báo kết quả.

- **Endpoint**: `POST /api/thesieutoc/callback`
- **Auth**: 🛡️ IP Whitelist & Double-Check Logic
- **Cơ chế bảo mật**:
    *   Hệ thống không tin tưởng ngay dữ liệu callback.
    *   Hệ thống sẽ gọi ngược lại API TheSieuToc để xác thực trạng thái thực tế của thẻ.
    *   Nếu dữ liệu callback khớp với API TheSieuToc => Cập nhật thành công.

---

## 2. Module PayOS (QR Payment)

Base URL: `/api/payos`

### 2.1 Tạo link thanh toán (Create Payment Link)
Tạo mã QR thanh toán VietQR chuyển khoản nhanh 24/7.

- **Endpoint**: `POST /api/payos/checkout`
- **Auth**: ✅ Required
- **Body**:
    ```json
    {
      "amount": 50000,
      "description": "Thanh toan don hang 123",
      "orderCode": 123456,            // (Optional) Tự sinh nếu không có
      "returnUrl": "https://...",
      "cancelUrl": "https://..."
    }
    ```
- **Response**:
    ```json
    {
      "success": true,
      "data": {
        "bin": "970422",
        "accountNumber": "...",
        "amount": 50000,
        "description": "...",
        "orderCode": 123456,
        "qrCode": "...",              // Mã VietQR dạng text
        "checkoutUrl": "https://..."  // Link trang thanh toán PayOS
      }
    }
    ```

### 2.2 Lấy thông tin thanh toán (PayOS API)
Lấy thông tin đơn hàng trực tiếp từ PayOS.

- **Endpoint**: `GET /api/payos/payment-info/:orderCode`
- **Auth**: ✅ Required
- **Response**:
    ```json
    {
      "success": true,
      "data": {
        "orderCode": 123456,
        "amount": 50000,
        "status": "PAID",
        "transactions": [...]
      }
    }
    ```

### 2.3 Tra cứu đơn hàng (Local DB)
Tra cứu trạng thái đơn hàng đã lưu trong database của hệ thống.

- **Endpoint**: `GET /api/payos/orders/:orderCode`
- **Auth**: ✅ Required
- **Response**:
    ```json
    {
      "success": true,
      "data": {
        "orderCode": 123456,
        "amount": 50000,
        "status": "SUCCESS",
        "createdAt": "2024-01-01T12:00:00Z"
      }
    }
    ```

### 2.4 Webhook Callback
Nhận thông báo khi khách hàng chuyển khoản thành công.

- **Endpoint**: `POST /api/payos/callback`
- **Auth**: 🛡️ Signature Verification (HMAC SHA256)
- **Mô tả**: PayOS SDK tự động xác thực chữ ký số để đảm bảo tính toàn vẹn dữ liệu.

---

## 3. Module Transaction (Giao dịch)

Base URL: `/api/transaction`
**Yêu cầu API Key cho tất cả endpoint.**

### 3.1 Lịch sử giao dịch (History)
- **Endpoint**: `GET /api/transaction/history`
- **Query Params**:
    - `limit`: Số lượng bản ghi (Max 100).
- **Response**: Danh sách lịch sử giao dịch tổng hợp (Cả Card và PayOS).

### 3.2 Tìm kiếm (Search)
- **Endpoint**: `GET /api/transaction/search`
- **Query Params**:
    - `serial`: Tìm theo số serial
    - `pin`: Tìm theo mã thẻ
    - `trans_id`: Tìm theo mã giao dịch
    - `status`: Tìm theo trạng thái (0, 1, 2, 3)

### 3.3 Chi tiết & Logs (Details)
- **Endpoint**: `GET /api/transaction/:id/logs`
- **Mô tả**: Xem chi tiết dòng đời của giao dịch (Created -> Processing -> Success/Failed).
- **Lưu ý**: Dữ liệu PIN và Serial nhạy cảm sẽ bị ẩn (VD: `1234****5678`).

---

## 4. Bảng mã trạng thái (Status Code Reference)

| Mã (Code) | Trạng thái (Text) | Mô tả |
| :--- | :--- | :--- |
| **0** | `PENDING` | Giao dịch đang được xử lý, chờ kết quả. |
| **1** | `SUCCESS` | Giao dịch thành công. Tiền đã được cộng. |
| **2** | `FAILED` | Giao dịch thất bại (Thẻ sai, Đã sử dụng...). |
| **3** | `WRONG_AMOUNT` | Thẻ đúng nhưng sai mệnh giá. Vẫn tính tiền nhưng bị phạt. |

---

## 5. System Health Check

Dành cho giám sát hệ thống (Uptime Robot, K8s, Docker).

- `GET /health` : Kiểm tra tổng quát (DB, Redis, Queue).
- `GET /health/ping` : Phản hồi "pong" nhanh.
