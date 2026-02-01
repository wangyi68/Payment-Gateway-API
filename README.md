# Payment Gateway API 💳

Giải pháp tích hợp thanh toán tự động, đa kênh, bảo mật cao. Hệ thống hỗ trợ tích hợp **Thẻ cào điện thoại** (qua TheSieuToc) và **Ngân hàng/QR Code** (qua PayOS).

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.0+-blue)
![Express](https://img.shields.io/badge/Express-v4.18-lightgrey)
![SQLite](https://img.shields.io/badge/SQLite-v3-orange)
![Security](https://img.shields.io/badge/Security-A%2B-red)

---

## 📋 Mục Lục

- [Tính Năng Nổi Bật](#-tính-năng-nổi-bật)
- [Yêu Cầu Hệ Thống](#-yêu-cầu-hệ-thống)
- [Cài Đặt & Chạy](#-cài-đặt--chạy)
- [Cấu Hình Environment](#-cấu-hình-environment)
- [API Summary](#-api-summary)
- [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)
- [Background Jobs](#-background-jobs--scheduler)
- [Logging System](#-logging-system)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [License](#-license)

---

## 🌟 Tính Năng Nổi Bật

### 🛡️ 1. Bảo Mật Cốt Lõi (Security First)
Chúng tôi đặt bảo mật là ưu tiên hàng đầu:
*   **Double-Check Verification (TheSieuToc)**: Ngăn chặn giả mạo callback 100%. Hệ thống tự động gọi ngược API nhà cung cấp để xác thực lại trạng thái thực tế của thẻ trước khi cộng tiền.
*   **Secure Signature (PayOS)**: Xác thực chữ ký số HMAC SHA256 cho mọi webhook thanh toán ngân hàng.
*   **Data Masking**: Tự động ẩn mã thẻ (PIN) và Serial trong toàn bộ Logs và API Response để bảo vệ dữ liệu người dùng.
*   **Secure Submission**: Sử dụng phương thức `POST` cho việc gửi thẻ, ngăn chặn lộ thông tin qua URL log.
*   **API Authentication**: Bảo vệ các endpoint nội bộ bằng API Key (`x-api-key` hoặc `Authorization` header).
*   **Rate Limiting**: Giới hạn request theo IP (5 req/min cho POST, 100 req/min cho GET).
*   **Helmet.js**: Thêm các HTTP security headers.
*   **Duplicate Card Detection**: Chặn thẻ trùng lặp trong khoảng thời gian cấu hình.
*   **Blacklist Management**: Theo dõi và chặn serial/PIN đáng ngờ.

### 💎 2. Gạch Thẻ Cào (TheSieuToc Module)
*   Hỗ trợ gạch thẻ tự động **Viettel, Vinaphone, Mobifone, Vietnamobile, Zing...**
*   Cơ chế **Polling & Scheduler** thông minh: Tự động quét và xử lý lại các thẻ bị treo (`Pending`) sau mỗi 5 phút.
*   Hỗ trợ xử lý thẻ sai mệnh giá (Chấp nhận thẻ nhưng áp dụng phí phạt).
*   **Validation đa lớp**: Kiểm tra format Serial/PIN, mệnh giá, nhà mạng hợp lệ.
*   **Transaction Logging**: Ghi log chi tiết từng giao dịch với timeline đầy đủ.

### 🏦 3. Thanh Toán QR (PayOS Module)
*   Tạo mã **VietQR** chuyển khoản nhanh 24/7 tương thích tất cả ngân hàng Việt Nam.
*   Tự động đồng bộ trạng thái đơn hàng ngay lập tức qua Webhook.
*   Tự động hủy đơn hàng quá hạn (Expired) để dọn dẹp hệ thống.
*   Lưu trữ lịch sử thanh toán local để tra cứu nhanh.

### ⚡ 4. Hiệu Năng & Ổn Định
*   **SQLite Database**: Lưu trữ nhẹ, không cần setup phức tạp.
*   **Redis Support (Optional)**: Hỗ trợ Redis cho queue và caching (có thể dùng In-Memory nếu không có Redis).
*   **Ngrok Integration**: Tích hợp sẵn Ngrok để public localhost ra Internet (thuận tiện nhận Webhook khi Dev).
*   **Static Domain Support**: Hỗ trợ sử dụng static domain Ngrok thay vì domain ngẫu nhiên.
*   **Graceful Shutdown**: Tắt server an toàn, đóng các kết nối trước khi exit.
*   **Zod Validation**: Type-safe configuration với Zod schema.

### 📊 5. Monitoring & Logging
*   **Winston Logger**: Logging phân tách rõ ràng theo level và module.
*   **Health Checks**: Đầy đủ endpoint cho monitoring (K8s-ready).
*   **System Info**: API lấy thông tin tài nguyên server.
*   **Transaction Timeline**: Theo dõi chi tiết dòng đời mỗi giao dịch.

---

## 💻 Yêu Cầu Hệ Thống

| Yêu cầu | Phiên bản | Bắt buộc |
|---------|-----------|----------|
| **Node.js** | v18 trở lên | ✅ |
| **NPM** | v8 trở lên | ✅ |
| **Tài khoản TheSieuToc** | - | ✅ (cho Card Module) |
| **Tài khoản PayOS** | - | ✅ (cho QR Module) |
| **Ngrok Account** | Free tier+ | ⚠️ (Dev túy chọn) |
| **Redis** | v6+ | ❌ (Optional) |

---

## 🚀 Cài Đặt & Chạy

### Bước 1: Clone & Cài đặt
```bash
git clone https://github.com/your-repo/payment-gateway-api.git
cd payment-gateway-api
npm install
```

### Bước 2: Cấu hình Environment
```bash
# Copy file mẫu
cp .env.example .env

# Mở file .env và điền thông tin của bạn
```

### Bước 3: Chạy ứng dụng

```bash
# 🔧 Development Mode (Tự động restart khi sửa code)
npm run dev

# 🏗️ Build Production
npm run build

# 🚀 Run Production
npm start
```

### Scripts có sẵn

| Script | Mô tả |
|--------|-------|
| `npm run dev` | Chạy development với hot-reload |
| `npm run build` | Build TypeScript ra JavaScript |
| `npm start` | Chạy production build |
| `npm run db:migrate` | Chạy database migration |
| `npm run db:export` | Export dữ liệu database ra JSON |
| `npm run lint` | Kiểm tra code với ESLint |
| `npm run lint:fix` | Auto-fix ESLint errors |
| `npm run format` | Format code với Prettier |
| `npm run clean` | Xóa thư mục dist |

---

## ⚙️ Cấu Hình Environment

Tham khảo file `.env.example` để biết đầy đủ các biến môi trường:

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| **TheSieuToc** |||
| `THESIEUTOC_API_KEY` | API Key từ TheSieuToc | ✅ |
| **PayOS** |||
| `PAYOS_CLIENT_ID` | Client ID từ PayOS | ✅ |
| `PAYOS_API_KEY` | API Key từ PayOS | ✅ |
| `PAYOS_CHECKSUM_KEY` | Checksum Key cho webhook verification | ✅ |
| **Server** |||
| `PORT` | Port server (default: 3000) | ❌ |
| `HOST` | Host bind (default: localhost) | ❌ |
| `NODE_ENV` | development / production / test | ❌ |
| **Database** |||
| `DATABASE_PATH` | Đường dẫn SQLite (default: ./data/database.sqlite) | ❌ |
| **Ngrok** |||
| `NGROK_AUTH_TOKEN` | Auth token cho Ngrok tunnel | ❌ |
| `NGROK_DOMAIN` | Static domain (vd: xxx.ngrok-free.dev) | ❌ |
| **Redis** |||
| `REDIS_HOST` | Redis host (để trống nếu dùng In-Memory) | ❌ |
| `REDIS_PORT` | Redis port (default: 6379) | ❌ |
| `REDIS_PASSWORD` | Redis password | ❌ |
| **Scheduler** |||
| `SCHEDULER_ENABLED` | Bật/tắt background jobs (default: true) | ❌ |
| **Cleanup** |||
| `CLEANUP_TRANSACTION_DAYS` | Số ngày giữ transactions (default: 90) | ❌ |
| `CLEANUP_LOG_DAYS` | Số ngày giữ log files (default: 30) | ❌ |
| `CLEANUP_BLACKLIST_DAYS` | Số ngày giữ blacklist (default: 180) | ❌ |
| **Validation** |||
| `DUPLICATE_CHECK_HOURS` | Thời gian check thẻ trùng (default: 24h) | ❌ |
| **Logging** |||
| `LOG_LEVEL` | error / warn / info / debug (default: info) | ❌ |
| **Security** |||
| `API_SECRET_KEY` | Key bảo vệ API endpoints | ❌ |

---

## 🔌 API Summary

Tài liệu chi tiết xem tại: **[API_ENDPOINTS.md](./API_ENDPOINTS.md)**

### TheSieuToc Module
| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `POST` | `/api/thesieutoc` | 🔒 | Gửi thẻ cào mới |
| `GET` | `/api/thesieutoc/discount` | 🌍 | Lấy bảng chiết khấu |
| `POST` | `/api/thesieutoc/status` | 🔒 | Kiểm tra trạng thái thẻ |
| `POST` | `/api/thesieutoc/callback` | 🛡️ | Webhook nhận kết quả từ TST |

### PayOS Module
| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `POST` | `/api/payos/checkout` | 🔒 | Tạo mã QR thanh toán |
| `GET` | `/api/payos/orders/:orderCode` | 🔒 | Tra cứu đơn hàng (Local) |
| `GET` | `/api/payos/payment-info/:orderCode` | 🔒 | Lấy thông tin từ PayOS API |
| `POST` | `/api/payos/callback` | 🛡️ | Webhook nhận thanh toán |

### Transaction Module
| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `GET` | `/api/transaction/history` | 🔒 | Lịch sử giao dịch |
| `GET` | `/api/transaction/search` | 🔒 | Tìm kiếm giao dịch |
| `GET` | `/api/transaction/:id/logs` | 🔒 | Chi tiết logs giao dịch |

### System Module
| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `GET` | `/api/system/info` | 🔒 | Thông tin server |
| `GET` | `/health` | 🌍 | Health check tổng quan |
| `GET` | `/health/live` | 🌍 | Liveness probe (K8s) |
| `GET` | `/health/ready` | 🌍 | Readiness probe (K8s) |
| `GET` | `/health/ping` | 🌍 | Ping check |
| `GET` | `/health/version` | 🌍 | Thông tin version |

**Chú thích:** 🔒 = Yêu cầu API Key | 🌍 = Công khai | 🛡️ = Webhook với verification

---

## 📁 Cấu Trúc Dự Án

```
payment-gateway-api/
├── 📄 .env                    # Environment variables (không commit)
├── 📄 .env.example            # Mẫu environment variables
├── 📄 .gitignore              # Git ignore rules
├── 📄 .prettierrc             # Prettier configuration
├── 📄 eslint.config.js        # ESLint configuration
├── 📄 package.json            # Dependencies & scripts
├── 📄 tsconfig.json           # TypeScript configuration
├── 📄 README.md               # Tài liệu này
├── 📄 API_ENDPOINTS.md        # Chi tiết API endpoints
│
├── 📁 data/                   # SQLite database files
│   └── database.sqlite        # Main database
│
├── 📁 dist/                   # Compiled JavaScript (build output)
│
├── 📁 logs/                   # Application logs
│   ├── combined.log           # Tất cả logs
│   ├── error.log              # Chỉ error logs
│   ├── thesieutoc.log         # Logs module thẻ cào
│   ├── thesieutoc_success.log # Thẻ gạch thành công (quan trọng!)
│   ├── payos.log              # Logs module PayOS
│   └── payossuccess.log       # Thanh toán thành công
│
├── 📁 tests/                  # Test scripts
│   ├── test-api.ps1           # PowerShell test script
│   ├── test-api.sh            # Bash test script
│   └── test-real-card.ps1     # Test với thẻ thật
│
└── 📁 src/                    # Source code
    ├── 📄 index.ts            # Entry point
    │
    ├── 📁 common/             # Shared utilities
    │   ├── errors/            # Custom error classes
    │   ├── middleware/        # Express middlewares
    │   │   ├── auth.ts        # API Key authentication
    │   │   ├── rate-limit.ts  # Rate limiting
    │   │   └── index.ts       # Error handlers, logger
    │   ├── types/             # TypeScript types/interfaces
    │   └── utils/             # Helper functions
    │       ├── logger.ts      # Winston logger setup
    │       └── helpers.ts     # General helpers
    │
    ├── 📁 config/             # Configuration
    │   └── index.ts           # Zod-validated config
    │
    ├── 📁 database/           # Database layer
    │   ├── index.ts           # SQLite connection
    │   └── migrate.ts         # Migration scripts
    │
    ├── 📁 jobs/               # Background jobs
    │   ├── scheduler.service.ts  # Cron jobs (cleanup, retry)
    │   └── queue.service.ts      # Redis/In-Memory queue
    │
    ├── 📁 modules/            # Feature modules
    │   ├── thesieutoc/        # Card top-up module
    │   │   ├── thesieutoc.controller.ts
    │   │   ├── thesieutoc.service.ts
    │   │   ├── thesieutoc.routes.ts
    │   │   └── validation.service.ts
    │   │
    │   ├── payos/             # QR payment module
    │   │   ├── payos.controller.ts
    │   │   ├── payos.service.ts
    │   │   └── payos.routes.ts
    │   │
    │   ├── transaction/       # Transaction management
    │   │   ├── transaction.controller.ts
    │   │   ├── transaction.service.ts
    │   │   └── transaction.routes.ts
    │   │
    │   └── system/            # System & Health checks
    │       ├── system.controller.ts
    │       ├── system.routes.ts
    │       └── health.service.ts
    │
    ├── 📁 routes/             # Route aggregation
    │   └── index.ts           # Main router
    │
    └── 📁 scripts/            # Utility scripts
        └── export-db.ts       # Export database to JSON
```

---

## 🔄 Background Jobs & Scheduler

Khi `SCHEDULER_ENABLED=true`, hệ thống sẽ chạy các scheduled tasks sau:

| Job | Cron | Mô tả |
|-----|------|-------|
| **Check Pending Cards** | `*/5 * * * *` (5 phút) | Kiểm tra lại các thẻ đang PENDING |
| **Retry Failed** | `*/10 * * * *` (10 phút) | Retry các giao dịch lỗi tạm thời |
| **Cleanup Old Data** | `0 3 * * *` (3:00 AM) | Xóa dữ liệu cũ theo cấu hình |
| **Expire PayOS Orders** | `*/15 * * * *` (15 phút) | Đánh dấu đơn hàng hết hạn |

---

## 📋 Logging System

### Log Files

| File | Mô tả | Auto Cleanup |
|------|-------|--------------|
| `combined.log` | Tất cả logs | ✅ |
| `error.log` | Chỉ error logs | ✅ |
| `thesieutoc.log` | Logs module thẻ cào | ✅ |
| `thesieutoc_success.log` | Thẻ gạch thành công | ❌ (Quan trọng) |
| `payos.log` | Logs module PayOS | ✅ |
| `payossuccess.log` | Thanh toán thành công | ❌ (Quan trọng) |

### Log Levels

- `error`: Chỉ lỗi nghiêm trọng
- `warn`: Cảnh báo cần chú ý
- `info`: Thông tin hoạt động (recommended cho production)
- `debug`: Chi tiết debug (chỉ dùng khi dev)

---

## 🧪 Testing

### Chạy test scripts

```bash
# PowerShell (Windows)
.\tests\test-api.ps1

# Bash (Linux/macOS)
chmod +x tests/test-api.sh
./tests/test-api.sh

# Test với thẻ thật (Cẩn thận!)
.\tests\test-real-card.ps1
```

### Test cases có sẵn

1. **Health Check** - Kiểm tra server running
2. **Get Discount** - Lấy bảng chiết khấu
3. **Submit Card (Validation)** - Test validation errors
4. **Submit Card (Valid)** - Gửi thẻ format đúng
5. **Check Status** - Kiểm tra trạng thái giao dịch
6. **Transaction History** - Lấy lịch sử
7. **Callback Simulation** - Test callback handler

---

## 🚢 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Cấu hình `API_SECRET_KEY` mạnh
- [ ] Cấu hình `HOST=0.0.0.0` để accept external connections
- [ ] Set `LOG_LEVEL=info` hoặc `warn`
- [ ] Cấu hình proper `THESIEUTOC_CALLBACK_URL` và `PAYOS_WEBHOOK_URL`
- [ ] Setup Redis cho production queue (recommended)
- [ ] Setup reverse proxy (Nginx/Caddy) với SSL
- [ ] Cấu hình backup cho SQLite database

### Docker (Coming Soon)

```dockerfile
# Dockerfile sẽ được cung cấp trong phiên bản tới
```

---

## 📝 License

Copyright (c) 2026. All rights reserved.

---

## 📞 Support

Nếu có vấn đề hoặc câu hỏi, vui lòng tạo issue trên repository.

---

**Made with ❤️ in Vietnam**