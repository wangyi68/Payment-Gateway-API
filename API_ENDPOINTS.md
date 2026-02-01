# 📚 Payment Gateway API Documentation

Tài liệu chi tiết về các endpoints của hệ thống Payment Gateway.

**Base URL**: `http://localhost:3000` (Development) hoặc `https://your-domain.com` (Production)

---

## 📋 Mục Lục

- [Xác thực & Bảo mật](#-xác-thực--bảo-mật-authentication--security)
- [Module TheSieuToc (Card)](#1-module-thesieutoc-card-mobile)
- [Module PayOS (QR Payment)](#2-module-payos-qr-payment)
- [Module Transaction](#3-module-transaction-giao-dịch)
- [Module System](#4-module-system-hệ-thống)
- [Root Endpoints](#5-system-root-endpoints-giám-sát)
- [Bảng mã trạng thái](#6-bảng-mã-trạng-thái-status-code-reference)
- [Error Responses](#7-error-responses)

---

## 🔐 Xác thực & Bảo mật (Authentication & Security)

Hệ thống sử dụng cơ chế bảo mật đa lớp:

### 1. API Key Authentication

Áp dụng cho các endpoint nhạy cảm (Gửi thẻ, Tạo link thanh toán, Tra cứu, System Info).

**Cách sử dụng:**

```http
# Option 1: Header x-api-key
x-api-key: your_api_secret_key_here

# Option 2: Authorization header
Authorization: Bearer your_api_secret_key_here
```

**Ví dụ với cURL:**
```bash
curl -X POST https://your-domain.com/api/thesieutoc \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_secret_key_here" \
  -d '{"username": "user123", "card_type": "Viettel", ...}'
```

### 2. Rate Limiting

| Loại Request | Giới hạn | Áp dụng |
|--------------|----------|---------|
| **POST** (Ghi) | 5 request/phút | Gửi thẻ, Tạo thanh toán |
| **GET** (Đọc) | 100 request/phút | Tra cứu, Lấy thông tin |

**Response khi bị rate limit:**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Bạn đã gửi quá nhiều request. Vui lòng thử lại sau.",
  "retryAfter": 60
}
```

### 3. Data Protection

*   ✅ Ẩn mã thẻ (PIN) và Serial trong log và API response (VD: `1234****5678`)
*   ✅ Sử dụng Prepared Statements chống SQL Injection
*   ✅ Helmet.js thêm các HTTP security headers
*   ✅ CORS được cấu hình phù hợp

---

## 1. Module TheSieuToc (Card Mobile)

**Base URL:** `/api/thesieutoc`

### 1.1 Gửi thẻ cào (Submit Card)

Gửi thông tin thẻ cào lên hệ thống để xử lý gạch thẻ.

- **Endpoint**: `POST /api/thesieutoc`
- **Auth**: ✅ Required (`x-api-key`)
- **Rate Limit**: ✅ Strict (5 req/min)
- **Content-Type**: `application/json`

**Request Body:**
```json
{
  "username": "user123",
  "card_type": "Viettel",
  "card_amount": "10000",
  "pin": "1234567890123",
  "serial": "100012345678",
  "request_id": "req_001"
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `username` | string | ✅ | Tên người dùng/Đại lý gửi thẻ |
| `card_type` | string | ✅ | Loại thẻ: `Viettel`, `Vinaphone`, `Mobifone`, `Vietnamobile`, `Zing` |
| `card_amount` | string | ✅ | Mệnh giá khai báo: `10000`, `20000`, `50000`, `100000`, `200000`, `500000` |
| `pin` | string | ✅ | Mã thẻ (10-15 ký tự, chữ và số) |
| `serial` | string | ✅ | Số serial (10-20 ký tự, chữ và số) |
| `request_id` | string | ❌ | Mã request riêng của client để tracking |

**Response Success (200 OK):**
```json
{
  "success": true,
  "message": "Gửi thẻ thành công",
  "data": {
    "transaction_id": "TRANS_1706789012345",
    "status": 0,
    "status_text": "PENDING",
    "card_type": "Viettel",
    "amount": 10000,
    "created_at": "2026-02-01T15:00:00.000Z"
  }
}
```

**Response Error (400 Bad Request):**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Serial không hợp lệ. Serial phải có 10-20 ký tự (chữ và số).",
  "details": {
    "field": "serial",
    "value": "123"
  }
}
```

---

### 1.2 Lấy bảng chiết khấu (Get Discount)

Lấy bảng chiết khấu % thực nhận hiện tại từ TheSieuToc.

- **Endpoint**: `GET /api/thesieutoc/discount/:account?`
- **Auth**: ❌ Không yêu cầu (Công khai)
- **Rate Limit**: ✅ Standard (100 req/min)

**URL Parameters:**
| Param | Type | Required | Mô tả |
|-------|------|----------|-------|
| `account` | string | ❌ | Tên tài khoản cụ thể để lấy mức chiết khấu riêng |

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "type": "Viettel",
      "value": 10000,
      "fees": 12.5,
      "penalty": 50
    },
    {
      "type": "Viettel",
      "value": 20000,
      "fees": 12.5,
      "penalty": 50
    },
    {
      "type": "Vinaphone",
      "value": 10000,
      "fees": 14.0,
      "penalty": 50
    }
  ],
  "updated_at": "2026-02-01T15:00:00.000Z"
}
```

| Field | Mô tả |
|-------|-------|
| `type` | Loại thẻ (Nhà mạng) |
| `value` | Mệnh giá thẻ (VNĐ) |
| `fees` | Phí gạch thẻ (%) - Số tiền bị trừ khi gạch thẻ đúng mệnh giá |
| `penalty` | Phạt sai mệnh giá (%) - Áp dụng khi thẻ đúng nhưng sai mệnh giá khai báo |

---

### 1.3 Kiểm tra trạng thái thẻ (Check Status)

Chủ động kiểm tra trạng thái thẻ dựa trên mã giao dịch.

- **Endpoint**: `POST /api/thesieutoc/status`
- **Auth**: ✅ Required (`x-api-key`)
- **Rate Limit**: ✅ Strict (5 req/min)
- **Content-Type**: `application/json`

**Request Body:**
```json
{
  "transaction_id": "TRANS_1706789012345"
}
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "transaction_id": "TRANS_1706789012345",
    "status": 1,
    "status_text": "SUCCESS",
    "card_type": "Viettel",
    "declared_amount": 50000,
    "actual_amount": 50000,
    "received_amount": 43750,
    "fee_percent": 12.5,
    "message": "Gạch thẻ thành công",
    "updated_at": "2026-02-01T15:05:00.000Z"
  }
}
```

**Response - Thẻ sai mệnh giá (200 OK):**
```json
{
  "success": true,
  "data": {
    "transaction_id": "TRANS_1706789012345",
    "status": 3,
    "status_text": "WRONG_AMOUNT",
    "card_type": "Viettel",
    "declared_amount": 100000,
    "actual_amount": 50000,
    "received_amount": 21875,
    "fee_percent": 12.5,
    "penalty_percent": 50,
    "message": "Thẻ đúng nhưng sai mệnh giá. Đã áp dụng phí phạt.",
    "updated_at": "2026-02-01T15:05:00.000Z"
  }
}
```

---

### 1.4 Webhook Callback (TheSieuToc → Server)

Endpoint dành cho TheSieuToc gọi về để thông báo kết quả gạch thẻ.

- **Endpoint**: `POST /api/thesieutoc/callback`
- **Auth**: 🛡️ Double-Check Verification
- **Content-Type**: `application/x-www-form-urlencoded`

**⚠️ Cơ chế bảo mật:**
1. Hệ thống **KHÔNG tin tưởng** ngay dữ liệu callback
2. Hệ thống gọi ngược lại API TheSieuToc để xác thực trạng thái thực tế
3. Chỉ cập nhật khi dữ liệu callback **khớp hoàn toàn** với API TheSieuToc

**Callback Data từ TheSieuToc:**
```
status=thanhcong
&serial=100012345678
&pin=1234567890123
&card_type=Viettel
&amount=50000
&receive_amount=50000
&real_amount=43750
&noidung=The+Thanh+Cong
&content=TRANS_1706789012345
```

**Response:**
```json
{
  "success": true,
  "message": "Callback processed successfully"
}
```

---

## 2. Module PayOS (QR Payment)

**Base URL:** `/api/payos`

### 2.1 Tạo link thanh toán (Create Payment Link)

Tạo mã QR thanh toán VietQR chuyển khoản nhanh 24/7.

- **Endpoint**: `POST /api/payos/checkout`
- **Auth**: ✅ Required (`x-api-key`)
- **Rate Limit**: ✅ Strict (5 req/min)
- **Content-Type**: `application/json`

**Request Body:**
```json
{
  "amount": 50000,
  "description": "Thanh toan don hang 123",
  "orderCode": 123456,
  "returnUrl": "https://your-site.com/success",
  "cancelUrl": "https://your-site.com/cancel",
  "buyerName": "Nguyen Van A",
  "buyerEmail": "email@example.com",
  "buyerPhone": "0901234567",
  "items": [
    {
      "name": "Gói Premium",
      "quantity": 1,
      "price": 50000
    }
  ]
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `amount` | number | ✅ | Số tiền thanh toán (VNĐ) |
| `description` | string | ✅ | Mô tả đơn hàng (max 50 ký tự) |
| `orderCode` | number | ❌ | Mã đơn hàng (tự sinh nếu không có) |
| `returnUrl` | string | ❌ | URL redirect khi thanh toán thành công |
| `cancelUrl` | string | ❌ | URL redirect khi hủy thanh toán |
| `buyerName` | string | ❌ | Tên người mua |
| `buyerEmail` | string | ❌ | Email người mua |
| `buyerPhone` | string | ❌ | Số điện thoại người mua |
| `items` | array | ❌ | Danh sách sản phẩm |

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "bin": "970422",
    "accountNumber": "0123456789",
    "accountName": "CONG TY ABC",
    "amount": 50000,
    "description": "Thanh toan don hang 123",
    "orderCode": 123456,
    "currency": "VND",
    "paymentLinkId": "abc123xyz",
    "status": "PENDING",
    "qrCode": "00020101021238620010A00000072701...",
    "checkoutUrl": "https://pay.payos.vn/web/abc123xyz",
    "expiredAt": "2026-02-01T16:00:00.000Z"
  }
}
```

---

### 2.2 Lấy thông tin thanh toán (PayOS API)

Lấy thông tin đơn hàng trực tiếp từ PayOS API.

- **Endpoint**: `GET /api/payos/payment-info/:orderCode`
- **Auth**: ✅ Required (`x-api-key`)

**URL Parameters:**
| Param | Type | Required | Mô tả |
|-------|------|----------|-------|
| `orderCode` | number | ✅ | Mã đơn hàng |

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "orderCode": 123456,
    "amount": 50000,
    "amountPaid": 50000,
    "amountRemaining": 0,
    "status": "PAID",
    "createdAt": "2026-02-01T15:00:00.000Z",
    "transactions": [
      {
        "reference": "FT123456789",
        "amount": 50000,
        "accountNumber": "0901234567",
        "description": "THANH TOAN 123456",
        "transactionDateTime": "2026-02-01T15:05:00.000Z"
      }
    ]
  }
}
```

---

### 2.3 Tra cứu đơn hàng (Local DB)

Tra cứu trạng thái đơn hàng đã lưu trong database của hệ thống.

- **Endpoint**: `GET /api/payos/orders/:orderCode`
- **Auth**: ✅ Required (`x-api-key`)

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderCode": 123456,
    "amount": 50000,
    "description": "Thanh toan don hang 123",
    "status": "SUCCESS",
    "checkoutUrl": "https://pay.payos.vn/web/abc123xyz",
    "paymentLinkId": "abc123xyz",
    "createdAt": "2026-02-01T15:00:00.000Z",
    "updatedAt": "2026-02-01T15:05:00.000Z"
  }
}
```

---

### 2.4 Webhook Callback (PayOS → Server)

Nhận thông báo khi khách hàng chuyển khoản thành công.

- **Endpoint**: `POST /api/payos/callback`
- **Auth**: 🛡️ Signature Verification (HMAC SHA256)
- **Content-Type**: `application/json`

**Cơ chế bảo mật:**
PayOS SDK tự động xác thực chữ ký số (`signature`) bằng HMAC SHA256 với `PAYOS_CHECKSUM_KEY`.

**Webhook Payload từ PayOS:**
```json
{
  "code": "00",
  "desc": "Thành công",
  "data": {
    "orderCode": 123456,
    "amount": 50000,
    "description": "THANH TOAN 123456",
    "accountNumber": "0901234567",
    "reference": "FT123456789",
    "transactionDateTime": "2026-02-01 15:05:00",
    "paymentLinkId": "abc123xyz"
  },
  "signature": "abc123signature..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed"
}
```

---

## 3. Module Transaction (Giao dịch)

**Base URL:** `/api/transaction`

**⚠️ Yêu cầu API Key cho TẤT CẢ endpoints trong module này.**

### 3.1 Lịch sử giao dịch (History)

Lấy danh sách lịch sử giao dịch tổng hợp (Cả Card và PayOS).

- **Endpoint**: `GET /api/transaction/history`
- **Auth**: ✅ Required (`x-api-key`)

**Query Parameters:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `limit` | number | 50 | Số lượng bản ghi (Max: 100) |
| `offset` | number | 0 | Vị trí bắt đầu (Pagination) |
| `type` | string | all | Loại giao dịch: `card`, `payos`, `all` |

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "TRANS_1706789012345",
        "type": "card",
        "username": "user123",
        "amount": 50000,
        "received_amount": 43750,
        "status": "SUCCESS",
        "status_text": "Thành công",
        "card_type": "Viettel",
        "created_at": "2026-02-01T15:00:00.000Z",
        "updated_at": "2026-02-01T15:05:00.000Z"
      },
      {
        "id": "PAYOS_123456",
        "type": "payos",
        "amount": 100000,
        "status": "SUCCESS",
        "status_text": "Thành công",
        "description": "Thanh toan don hang",
        "created_at": "2026-02-01T14:00:00.000Z",
        "updated_at": "2026-02-01T14:02:00.000Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

---

### 3.2 Tìm kiếm (Search)

Tìm kiếm giao dịch theo nhiều tiêu chí.

- **Endpoint**: `GET /api/transaction/search`
- **Auth**: ✅ Required (`x-api-key`)

**Query Parameters:**
| Param | Type | Mô tả |
|-------|------|-------|
| `serial` | string | Tìm theo số serial (hỗ trợ tìm kiếm gần đúng) |
| `pin` | string | Tìm theo mã thẻ |
| `trans_id` | string | Tìm theo mã giao dịch (chính xác) |
| `username` | string | Tìm theo tên người dùng |
| `status` | number | Tìm theo trạng thái: `0`, `1`, `2`, `3` |
| `from_date` | string | Lọc từ ngày (ISO 8601) |
| `to_date` | string | Lọc đến ngày (ISO 8601) |

**Ví dụ:**
```
GET /api/transaction/search?serial=10001&status=1&from_date=2026-01-01
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactions": [...],
    "count": 5
  }
}
```

---

### 3.3 Chi tiết & Logs (Details)

Xem chi tiết dòng đời của một giao dịch (Created → Processing → Success/Failed).

- **Endpoint**: `GET /api/transaction/:id/logs`
- **Auth**: ✅ Required (`x-api-key`)

**URL Parameters:**
| Param | Type | Required | Mô tả |
|-------|------|----------|-------|
| `id` | string | ✅ | Transaction ID |

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "TRANS_1706789012345",
      "type": "card",
      "username": "user123",
      "card_type": "Viettel",
      "serial": "1000****5678",
      "pin": "1234****0123",
      "declared_amount": 50000,
      "actual_amount": 50000,
      "received_amount": 43750,
      "status": 1,
      "status_text": "SUCCESS"
    },
    "timeline": [
      {
        "action": "CREATED",
        "message": "Giao dịch được tạo",
        "timestamp": "2026-02-01T15:00:00.000Z"
      },
      {
        "action": "SENT_TO_TST",
        "message": "Đã gửi thẻ lên TheSieuToc",
        "timestamp": "2026-02-01T15:00:01.000Z"
      },
      {
        "action": "CALLBACK_RECEIVED",
        "message": "Nhận callback từ TheSieuToc",
        "timestamp": "2026-02-01T15:04:55.000Z"
      },
      {
        "action": "VERIFIED",
        "message": "Đã xác thực với TheSieuToc API",
        "timestamp": "2026-02-01T15:04:56.000Z"
      },
      {
        "action": "COMPLETED",
        "message": "Giao dịch hoàn tất - Thành công",
        "timestamp": "2026-02-01T15:04:57.000Z"
      }
    ]
  }
}
```

**Lưu ý:** Dữ liệu PIN và Serial nhạy cảm sẽ bị ẩn (VD: `1234****5678`).

---

## 4. Module System (Hệ thống)

**Base URL:** `/api/system`

### 4.1 Thông tin hệ thống (System Info)

Trả về thông tin tài nguyên hệ thống và cấu hình cơ bản.

- **Endpoint**: `GET /api/system/info`
- **Auth**: ✅ Required (`x-api-key`)

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "server": {
      "name": "Payment Gateway API",
      "version": "1.0.0",
      "environment": "production",
      "uptime": 86400,
      "uptime_text": "1 day, 0 hours, 0 minutes"
    },
    "system": {
      "platform": "linux",
      "arch": "x64",
      "nodeVersion": "v18.19.0",
      "memory": {
        "total": 8589934592,
        "used": 2147483648,
        "free": 6442450944,
        "usage_percent": 25
      },
      "cpu": {
        "model": "Intel(R) Core(TM) i7-10700K",
        "cores": 8,
        "usage_percent": 15
      }
    },
    "database": {
      "type": "SQLite",
      "path": "./data/database.sqlite",
      "size": "2.5 MB",
      "transactions_count": 1500
    },
    "redis": {
      "connected": true,
      "host": "localhost:6379"
    },
    "scheduler": {
      "enabled": true,
      "jobs_active": 4
    }
  }
}
```

---

### 4.2 Health Checks (API Level)

Các endpoint này cũng được alias tại Root Level (xem mục 5) nhưng có thể truy cập qua API Prefix.

| Endpoint | Mô tả |
|----------|-------|
| `GET /api/system/health` | Kiểm tra tổng quát (DB, Redis, Queue) |
| `GET /api/system/health/live` | Liveness Probe cho K8s |
| `GET /api/system/health/ready` | Readiness Probe cho K8s |
| `GET /api/system/health/version` | Thông tin phiên bản |
| `GET /api/system/health/ping` | Ping check đơn giản |

---

## 5. System Root Endpoints (Giám sát)

Các endpoint này nằm ở cấp Root (`/`) phục vụ cho tool monitoring (Uptime Robot, K8s, Docker).

### 5.1 API Info

- **Endpoint**: `GET /`
- **Auth**: ❌ Không yêu cầu

**Response:**
```json
{
  "name": "Payment Gateway API",
  "version": "1.0.0",
  "description": "Card (TheSieuToc) + Bank/QR (PayOS)",
  "documentation": "/rest",
  "health": "/health"
}
```

---

### 5.2 API Documentation (JSON)

- **Endpoint**: `GET /rest`
- **Auth**: ❌ Không yêu cầu

**Response:** Danh sách tất cả endpoints có sẵn (JSON format).

---

### 5.3 Health Check (Tổng quát)

- **Endpoint**: `GET /health`
- **Auth**: ❌ Không yêu cầu

**Response Success (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-01T15:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 5
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2
    },
    "thesieutoc": {
      "status": "healthy",
      "lastCheck": "2026-02-01T14:55:00.000Z"
    },
    "payos": {
      "status": "healthy"
    }
  }
}
```

**Response Unhealthy (503 Service Unavailable):**
```json
{
  "status": "unhealthy",
  "timestamp": "2026-02-01T15:00:00.000Z",
  "checks": {
    "database": {
      "status": "unhealthy",
      "error": "Connection refused"
    }
  }
}
```

---

### 5.4 Liveness Probe

- **Endpoint**: `GET /health/live`
- **Mô tả**: Cho biết ứng dụng có đang chạy không. Dùng cho K8s liveness probe.

**Response (200 OK):**
```json
{
  "status": "alive",
  "timestamp": "2026-02-01T15:00:00.000Z"
}
```

---

### 5.5 Readiness Probe

- **Endpoint**: `GET /health/ready`
- **Mô tả**: Cho biết ứng dụng có sẵn sàng nhận traffic không. Dùng cho K8s readiness probe.

**Response Ready (200 OK):**
```json
{
  "status": "ready",
  "timestamp": "2026-02-01T15:00:00.000Z"
}
```

**Response Not Ready (503):**
```json
{
  "status": "not_ready",
  "reason": "Database connection not established"
}
```

---

### 5.6 Ping

- **Endpoint**: `GET /health/ping`
- **Mô tả**: Phản hồi nhanh nhất có thể (không kiểm tra dependencies).

**Response (200 OK):**
```json
{
  "message": "pong",
  "timestamp": "2026-02-01T15:00:00.000Z"
}
```

---

### 5.7 Version Info

- **Endpoint**: `GET /health/version`

**Response (200 OK):**
```json
{
  "name": "Payment Gateway API",
  "version": "1.0.0",
  "node": "v18.19.0",
  "environment": "production"
}
```

---

## 6. Bảng mã trạng thái (Status Code Reference)

### Trạng thái giao dịch Card (TheSieuToc)

| Code | Text | Mô tả | Hành động |
|:----:|:-----|:------|:----------|
| **0** | `PENDING` | Giao dịch đang được xử lý, chờ kết quả từ nhà mạng | Chờ callback hoặc kiểm tra lại sau |
| **1** | `SUCCESS` | Giao dịch thành công. Thẻ đúng mệnh giá, tiền đã được cộng | ✅ Hoàn tất |
| **2** | `FAILED` | Giao dịch thất bại (Thẻ sai, đã sử dụng, hết hạn...) | ❌ Thẻ không hợp lệ |
| **3** | `WRONG_AMOUNT` | Thẻ đúng nhưng sai mệnh giá. Vẫn tính tiền nhưng bị phạt | ⚠️ Cảnh báo user |

### Trạng thái đơn hàng PayOS

| Status | Mô tả |
|:-------|:------|
| `PENDING` | Đơn hàng đã tạo, chờ thanh toán |
| `PROCESSING` | Đang xử lý thanh toán |
| `PAID` | Đã thanh toán thành công |
| `CANCELLED` | Đã hủy (bởi user hoặc hết hạn) |
| `EXPIRED` | Đơn hàng hết hạn (quá 24h) |

---

## 7. Error Responses

### Format chuẩn

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Mô tả chi tiết lỗi bằng tiếng Việt",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Code | Meaning | Mô tả |
|:----:|:--------|:------|
| `200` | OK | Thành công |
| `400` | Bad Request | Dữ liệu gửi lên không hợp lệ |
| `401` | Unauthorized | Thiếu hoặc sai API Key |
| `403` | Forbidden | Không có quyền truy cập |
| `404` | Not Found | Không tìm thấy resource |
| `429` | Too Many Requests | Vượt quá rate limit |
| `500` | Internal Server Error | Lỗi server |
| `503` | Service Unavailable | Server không sẵn sàng |

### Các lỗi thường gặp

**Thiếu API Key:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "API Key is required. Please provide x-api-key header.",
  "code": "MISSING_API_KEY"
}
```

**Sai API Key:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid API Key",
  "code": "INVALID_API_KEY"
}
```

**Validation Error:**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Serial không hợp lệ",
  "code": "VALIDATION_FAILED",
  "details": {
    "field": "serial",
    "received": "123",
    "expected": "10-20 ký tự alphanumeric"
  }
}
```

**Thẻ trùng lặp:**
```json
{
  "success": false,
  "error": "Duplicate Card",
  "message": "Thẻ này đã được gửi trước đó. Vui lòng kiểm tra lại.",
  "code": "DUPLICATE_CARD",
  "details": {
    "previous_transaction": "TRANS_xxx",
    "submitted_at": "2026-02-01T14:00:00.000Z"
  }
}
```

**Rate Limit:**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Bạn đã gửi quá nhiều request. Vui lòng thử lại sau 60 giây.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

---

## 📌 Quick Reference

### cURL Examples

**Gửi thẻ cào:**
```bash
curl -X POST https://your-domain.com/api/thesieutoc \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "username": "user123",
    "card_type": "Viettel",
    "card_amount": "50000",
    "serial": "1234567890123",
    "pin": "123456789012345"
  }'
```

**Tạo thanh toán QR:**
```bash
curl -X POST https://your-domain.com/api/payos/checkout \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "amount": 50000,
    "description": "Thanh toan don hang 001"
  }'
```

**Lấy lịch sử giao dịch:**
```bash
curl -X GET "https://your-domain.com/api/transaction/history?limit=10" \
  -H "x-api-key: YOUR_API_KEY"
```

---

**Last Updated:** 2026-02-01

**Version:** 1.1.0
