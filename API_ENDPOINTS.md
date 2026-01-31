# 📑 Tài Liệu Chi Tiết API Endpoints

Tài liệu này cung cấp hướng dẫn đầy đủ về các điểm cuối (endpoints) API, cấu trúc dữ liệu, mã lỗi và logic xử lý của hệ thống **payment-gateway-api**.

---

## 🧭 Mục lục
1. [Xác Thực & Bảo Mật](#xác-thực--bảo-mật)
2. [Health Check (Kiểm tra hệ thống)](#health-check-kiểm-tra-hệ-thống)
3. [Card Module (Thẻ cào - TheSieuToc)](#card-module-thẻ-cào---thesieutoc)
4. [PayOS Module (Thanh toán QR/Bank)](#payos-module-thanh-toán-qrbank)
5. [Transaction Module (Quản lý giao dịch)](#transaction-module-quản-lý-giao-dịch)
6. [System Module (Thông tin server)](#system-module-thông-tin-server)
7. [Phụ lục Mã lỗi (Error Codes)](#phụ-lục-mã-lỗi)

---

## 🔐 Xác Thực & Bảo Mật

- **Môi trường**: Hệ thống tự động nhận diện `development` hoặc `production` từ file `.env`.
- **Ngrok**: Khi chạy ở local, Ngrok sẽ tạo một public URL (ví dụ: `https://abcd.ngrok-free.dev`) để bạn có thể nhận callback từ TheSieuToc/PayOS.
- **Webhook Security**:
    - **TheSieuToc**: Xác thực dựa trên IP và dữ liệu trả về.
    - **PayOS**: Xác thực bằng HMAC SHA256 thông qua SDK chính thức.

---

## 🏥 Health Check (Kiểm tra hệ thống)

### 1. Chi tiết trạng thái (Full Health)
`GET /health`

**Mô tả:** Kiểm tra kết nối Database, Redis, PayOS API, và Ngrok.
**Response (200 OK):**
```json
{
    "status": "healthy",
    "timestamp": "2026-01-31T12:30:00.000Z",
    "services": {
        "database": { "status": "up", "latency": 2 },
        "thesieutoc": { "status": "up" },
        "payos": { "status": "up", "message": "Configured" }
    }
}
```

---

## 💳 Card Module (Thẻ cào - TheSieuToc)

> **Cấu hình**: Yêu cầu `THESIEUTOC_API_KEY` trong `.env`.

### 1. Gửi thẻ nạp
`POST /api/card`

**Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `username` | String | Yes | Tên người dùng hoặc ID nạp thẻ |
| `card_type` | String | Yes | `Viettel`, `Mobifone`, `Vinaphone`, `Vietnamobile`, `Zing`, `Gate`, `Garena`, `Vcoin` |
| `card_amount` | Number | Yes | Mệnh giá thẻ (10000, 20000, ...) |
| `serial` | String | Yes | Số Serial của thẻ |
| `pin` | String | Yes | Mã nạp thẻ (Mật mã dưới lớp cào) |

**Logic xử lý:**
1. Kiểm tra định dạng Serial/PIN (Ví dụ: Viettel 11-15 số).
2. Kiểm tra Blacklist (Nếu thẻ đã từng gửi trong 24h qua sẽ bị từ chối ngay).
3. Gửi sang TheSieuToc v2 API.
4. Lưu trạng thái `PENDING` vào Database local.

---

### 2. Lấy chiết khấu hiện tại
`GET /api/card/discount/:account?`

**Mô tả:** Trả về bảng chiết khấu (%) hiện tại của các nhà mạng. Càng thấp càng tốt (ví dụ: 30 nghĩa là bạn nhận được 70% giá trị thẻ).

---

### 3. Kiểm tra trạng thái thẻ (Manual Check)
`POST /api/card/status`

**Body:** `{"transaction_id": "Mã_giao_dịch_trả-về-khi-gửi-thẻ"}`
**Mô tả:** Chủ động hỏi API TheSieuToc về tình trạng thẻ nếu chưa nhận được callback.

---

## 📲 PayOS Module (Thanh toán QR/Bank)

> **Cấu hình**: Yêu cầu `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.

### 1. Tạo Link Thanh Toán
`POST /api/payos/checkout`

**Request Body:**
```json
{
    "amount": 20000,
    "description": "Thanh toán đơn hàng #123",
    "returnUrl": "https://yoursite.com/success",
    "cancelUrl": "https://yoursite.com/cancel",
    "orderCode": 123456 
}
```
**Đặc điểm nổi bật:**
- **orderCode**: Trường này là **tùy chọn (Optional)**. Nếu bạn bỏ trống, Server sẽ tự sinh một dãy số duy nhất dựa trên `Timestamp + Random`.
- **An toàn**: Server lưu đơn hàng vào DB trước khi gọi PayOS để đảm bảo không mất dữ liệu.

---

### 2. Webhook Callback (Tự động)
`POST /api/payos/callback`

**Mô tả:** PayOS gọi vào đây khi khách quét QR thành công.
- **Xác thực**: Sử dụng `payOS.webhooks.verify(body)` để đảm bảo dữ liệu chưa bị can thiệp.
- **Hành động**: Cập nhật trạng thái `SUCCESS` trong Database và ghi log vào `cardsuccess.log`.

---

### 3. Xem đơn hàng (Local)
`GET /api/payos/orders/:orderCode`
**Mô tả:** Xem lịch sử đơn hàng PayOS lưu tại Database của bạn (Nhanh, không cần mạng).

---

### 4. Truy vấn đơn hàng (PayOS)
`GET /api/payos/payment-info/:orderCode`
**Mô tả:** Hỏi trực tiếp PayOS về đơn hàng (Chính xác tuyệt đối, cần kết nối mạng).

---

## 📊 Transaction Module (Quản lý giao dịch)

### 1. Lấy lịch sử giao dịch
`GET /api/transaction/history?limit=20`

**Response:** Trả về danh sách giao dịch thẻ cào và PayOS mới nhất, bao gồm cả trạng thái hiển thị bằng tiếng Việt.

---

### 2. Tìm kiếm nâng cao
`GET /api/transaction/search`

**Query Params:**
- `serial`: Tìm theo số serial thẻ.
- `trans_id`: Tìm theo mã giao dịch hệ thống.
- `status`: Lọc theo trạng thái (0: Chờ, 1: Thành công, 2: Thất bại).

---

## 📝 Nhật Ký Hệ Thống (Logging)

Hệ thống phân tách log để dễ dàng quản lý:
1. **`logs/combined.log`**: Toàn bộ nhật ký hoạt động.
2. **`logs/error.log`**: Chỉ chứa các lỗi nghiêm trọng.
3. **`logs/card.log`**: Lịch sử gửi và nhận thẻ cào.
4. **`logs/cardsuccess.log`**: **(Quan trọng)** Chứa danh sách các thẻ nạp TIỀN ĐÃ VÀO (bao gồm thẻ đúng mệnh giá và sai mệnh giá). File này không bị xóa bởi hệ thống dọn dẹp tự động.

---

## 🛠 Phụ Lục Mã Lỗi

| Mã lỗi | Ý nghĩa | Cách khắc phục |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | Dữ liệu gửi lên không đúng định dạng | Kiểm tra lại body request (số tiền, định dạng thẻ) |
| `PAYOS_SIGNATURE_INVALID` | Chữ ký Webhook không khớp | Kiểm tra `PAYOS_CHECKSUM_KEY` trong `.env` |
| `DUPLICATE_CARD` | Thẻ đã được gửi trước đó | Đợi 24h hoặc kiểm tra lại lịch sử |
| `INTERNAL_ERROR` | Lỗi máy chủ | Kiểm tra `logs/error.log` để biết chi tiết |

---
*Tài liệu được cập nhật mới nhất vào ngày: 31/01/2026*
