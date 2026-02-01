# Payment Gateway API 💳

Giải pháp tích hợp thanh toán tự động, đa kênh, bảo mật cao. Hệ thống hỗ trợ tích hợp **Thẻ cào điện thoại** (qua TheSieuToc) và **Ngân hàng/QR Code** (qua PayOS).

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.0+-blue)
![Express](https://img.shields.io/badge/Express-v4.18-lightgrey)
![Security](https://img.shields.io/badge/Security-A%2B-red)

---

## 🌟 Tính Năng Nổi Bật

### 🛡️ 1. Bảo Mật Cốt Lõi (Security First)
Chúng tôi đặt bảo mật là ưu tiên hàng đầu:
*   **Double-Check Verification (TheSieuToc)**: Ngăn chặn giả mạo callback 100%. Hệ thống tự động gọi ngược API nhà cung cấp để xác thực lại trạng thái thực tế của thẻ trước khi cộng tiền.
*   **Secure Signature (PayOS)**: Xác thực chữ ký số HMAC SHA256 cho mọi webhook thanh toán ngân hàng.
*   **Data Masking**: Tự động ẩn mã thẻ (PIN) và Serial trong toàn bộ Logs và API Response để bảo vệ dữ liệu người dùng.
*   **Secure Submission**: Sử dụng phương thức `POST` cho việc gửi thẻ, ngăn chặn lộ thông tin qua URL log.
*   **API Authentication**: Bảo vệ các endpoint nội bộ bằng API Key.

### 💎 2. Gạch Thẻ Cào (TheSieuToc Module)
*   Hỗ trợ gạch thẻ tự động Viettel, Vina, Mobi, Vietnamoblie, Zing...
*   Cơ chế **Polling & Scheduler** thông minh: Tự động quét và xử lý lại các thẻ bị treo (`Pending`) sau mỗi 5 phút.
*   Hỗ trợ xử lý thẻ sai mệnh giá (Chấp nhận thẻ nhưng áp dụng phí phạt).

### 🏦 3. Thanh Toán QR (PayOS Module)
*   Tạo mã VietQR chuyển khoản nhanh 24/7.
*   Tự động đồng bộ trạng thái đơn hàng ngay lập tức qua Webhook.
*   Tự động hủy đơn hàng quá hạn (Expired) để dọn dẹp hệ thống.

### ⚡ 4. Hiệu Năng & Ổn Định
*   **SQLite / Redis**: Tối ưu hóa lưu trữ và caching.
*   **Ngrok Integration**: Tích hợp sẵn Ngrok để public localhost ra Internet (thuận tiện nhận Webhook khi Dev).
*   **Smart Logging**: Hệ thống log phân tách rõ ràng (Error, Transaction, Success).

---

## 🚀 Cài Đặt & Chạy

### Yêu cầu
*   Node.js v18 trở lên.
*   Tài khoản [TheSieuToc](https://thesieutoc.net) (Lấy API Key).
*   Tài khoản [PayOS](https://payos.vn) (Lấy Client ID, API Key, Checksum Key).

### Bước 1: Clone & Cài đặt
```bash
git clone https://github.com/your-repo/payment-gateway-api.git
cd payment-gateway-api
npm install
```

### Bước 2: Cấu hình Environment
Copy file mẫu và điền thông tin của bạn:
```bash
cp .env.example .env
```
Mở file `.env` và cập nhật:
*   `THESIEUTOC_API_KEY`: Key gạch thẻ.
*   `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`: Key thanh toán QR.
*   `API_SECRET_KEY`: (Tự tạo) Key bảo vệ API của riêng bạn.

### Bước 3: Chạy ứng dụng
```bash
# Chạy môi trường Dev (Tự động restart khi sửa code)
npm run dev

# Build & Chạy Production
npm run build
npm start
```

---

## 🔌 API Summary

Tài liệu chi tiết xem tại: [API_ENDPOINTS.md](./API_ENDPOINTS.md)

| Module | Method | Endpoint | Auth | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **THESIEUTOC** | `POST` | `/api/thesieutoc` | 🔒 | Gửi thẻ cào mới |
| | `POST` | `/api/thesieutoc/status` | 🔒 | Kiểm tra trạng thái thẻ |
| | `POST` | `/api/thesieutoc/callback` | 🌍 | Webhook nhận kết quả |
| **PAYOS** | `POST` | `/api/payos/checkout` | 🔒 | Tạo mã QR thanh toán |
| | `GET` | `/api/payos/orders/:code`| 🔒 | Kiểm tra đơn hàng (Local) |
| | `GET` | `/api/payos/payment-info/:code`| 🔒 | Lấy thông tin thanh toán (API) |
| | `POST` | `/api/payos/callback`| 🌍 | Webhook nhận kết quả |
| **SYSTEM** | `GET` | `/api/transaction/history`| 🔒 | Lịch sử giao dịch |
| | `GET` | `/health` | 🌍 | Kiểm tra sức khỏe Server |

*Chú thích:* 🔒 = Yêu cầu API Key | 🌍 = Công khai

---

## 📁 Cấu Trúc Dự Án

```
src/
├── common/             # Thư viện dùng chung (Logger, Error, Utils)
├── config/             # Cấu hình Env, Zod Schema
├── database/           # SQLite setup
├── jobs/               # Scheduler (Cron jobs), Queue
├── modules/            # Các tính năng chính
│   ├── thesieutoc/     # Module xử lý thẻ cào
│   ├── payos/          # Module xử lý thanh toán QR
│   ├── transaction/    # Quản lý giao dịch
│   └── system/         # Healthcheck
└── routes/             # Định tuyến API
```

## 📝 License
Copyright (c) 2026. All rights reserved.