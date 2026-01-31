# Payment Gateway API

Payment Gateway - **Thẻ cào** (TheSieuToc) + **Ngân hàng/QR** (PayOS) - Built with TypeScript.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg)

## 🚀 Tính Năng Chính

### 🛡️ TheSieuToc Integration
- **Full API TheSieuToc**: Gửi thẻ, kiểm tra trạng thái, lấy chiết khấu.
- **Webhook Callback**: Xử lý callback từ TheSieuToc tự động và an toàn.
- **Card Validation**: Kiểm tra định dạng serial/PIN thông minh theo từng nhà mạng.
- **Blacklist & Duplicate Check**: Quản lý thẻ bị chặn và ngăn chặn thẻ trùng lặp trong 24h.

### 💳 PayOS Integration
- **Payment Link**: Tạo link thanh toán QR/ngân hàng chuyên nghiệp.
- **Auto OrderCode**: Tự động sinh mã đơn hàng duy nhất dựa trên timestamp nếu không được cung cấp.
- **Webhook Verification**: Xác thực chữ ký số (HMAC SHA256) từ PayOS SDK.
- **Transaction Logging**: Lưu trữ và truy vết lịch sử thanh toán chi tiết.

### ⚡ Core Features
- **TypeScript Dedicated**: Codebase an toàn với `strict` mode và Zod validation mạnh mẽ.
- **SQLite Database**: Lưu trữ giao dịch hiệu năng cao với `better-sqlite3`.
- **Smart Queue & Scheduler**:
  - Hỗ trợ Redis hoặc In-Memory fallback cho hệ thống hàng đợi.
  - Tự động kiểm tra thẻ pending mỗi 5 phút.
  - Retry callback thông minh với exponential backoff.
  - Tự động dọn dẹp dữ liệu cũ (log, transactions) định kỳ.
- **Ngrok Tunnel**: Hỗ trợ HTTPs công khai với static domain cho việc phát triển local.
- **Security & Performance**: Tích hợp `helmet`, `cors`, `compression` và logging chuyên dụng.

## 📁 Cấu Trúc Dự Án

```text
src/
├── common/                     # Tiện ích dùng chung
│   ├── errors/                 # Custom error classes (AppError, PayOSError, etc.)
│   ├── middleware/             # Express middlewares (Error handler, logging)
│   ├── types/                  # TypeScript interfaces & Zod schemas
│   └── utils/                  # Utility functions (Logger, formatting)
├── config/                     # Cấu hình hệ thống & Env validation
├── database/                   # SQLite database & Migration scripts
├── jobs/                       # Background services (Queue, Scheduler)
├── modules/                    # Module tính năng chính
│   ├── callback/               # Handlers xử lý Webhook (TheSieuToc + PayOS)
│   ├── card/                   # Xử lý nạp thẻ cào TheSieuToc
│   ├── payment/                # Xử lý thanh toán PayOS
│   ├── system/                 # Health check & thông tin hệ thống
│   └── transaction/            # Quản lý lịch sử giao dịch
├── routes/                     # Main router (tập hợp tất cả module)
└── index.ts                    # Entry point của ứng dụng
```

## 📋 Yêu Cầu Hệ Thống

- **Node.js**: v18.x trở lên
- **NPM**: v9.x trở lên
- **Redis**: Tùy chọn (tự động dùng In-Memory nếu không có)

## 📦 Cài Đặt

1. **Cài đặt dependencies**:
   ```bash
   npm install
   ```

2. **Cấu hình môi trường**:
   ```bash
   cp .env.example .env
   ```
   *Chỉnh sửa các giá trị `API_KEY` trong file `.env`.*

3. **Chạy ứng dụng**:
   ```bash
   # Development (hot reload)
   npm run dev
   
   # Build & Start (Production)
   npm run build
   npm start
   ```

4. **Các lệnh hỗ trợ**:
   ```bash
   # Migration Database (Khởi tạo DB)
   npm run db:migrate

   # Kiểm tra và sửa lỗi Code Style (Lint/Prettier)
   npm run lint        # Kiểm tra lỗi
   npm run lint:fix    # Tự động sửa lỗi lint
   npm run format      # Định dạng lại code với Prettier

   # Dọn dẹp bản build
   npm run clean
   ```

## 🔌 API Endpoints Summary

> Xem chi tiết tại [API_ENDPOINTS.md](./API_ENDPOINTS.md)

| Module | Endpoint | Method | Mô tả |
| :--- | :--- | :--- | :--- |
| **Card** | `/api/card` | `POST` | Gửi thẻ cào mới |
| | `/api/card/discount` | `GET` | Lấy bảng chiết khấu |
| | `/api/card/callback` | `POST` | Webhook từ TheSieuToc |
| **PayOS** | `/api/payos/checkout` | `POST` | Tạo link thanh toán |
| | `/api/payos/callback` | `POST` | Webhook từ PayOS |
| | `/api/payos/orders/:code` | `GET` | Xem đơn hàng (Local DB) |
| **Trans** | `/api/transaction/history` | `GET` | Lịch sử giao dịch gần đây |
| **System** | `/health` | `GET` | Kiểm tra tình trạng server |

## 📝 Logging System

Hệ thống ghi log vào thư mục `logs/`:
- `combined.log`: Toàn bộ nhật ký hoạt động của hệ thống.
- `error.log`: Chỉ ghi lại các lỗi phát sinh (Runtime Errors, API Errors).
- `card.log`: Lịch sử chi tiết việc gửi và nhận kết quả thẻ cào.
- `payos.log`: Nhật ký tạo link thanh toán và callback từ PayOS.
- **`cardsuccess.log`**: Lưu trữ vĩnh viễn các giao dịch thẻ thành công (bao gồm cả sai mệnh giá).
- **`payossuccess.log`**: Lưu trữ vĩnh viễn các đơn hàng ngân hàng/QR đã thanh toán xong.

## 📄 License

MIT License - Copyright (c) 2026.