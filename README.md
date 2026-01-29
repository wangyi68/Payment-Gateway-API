# TheSieuToc API Gateway (TypeScript Version)

Phiên bản TypeScript của API Gateway tích hợp với [TheSieuToc.net](https://thesieutoc.net).
Project này được viết lại từ phiên bản PHP/Laravel cũ để tăng hiệu năng, an toàn kiểu dữ liệu (Vue/React friendly) và dễ dàng mở rộng.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg)

## 🚀 Tính Năng Chính

- **Full API TheSieuToc**: Gửi thẻ, kiểm tra trạng thái, lấy chiết khấu.
- **Webhook Callback**: Xử lý callback từ TheSieuToc tự động, có validation chữ ký (signature) và tự động cập nhật trạng thái giao dịch.
- **TypeScript**: Codebase an toàn, dễ bảo trì với `strict` mode.
- **Đa ngôn ngữ (i18n)**:
  - Hỗ trợ phản hồi API bằng 3 ngôn ngữ: **Tiếng Việt (vi)**, **Tiếng Anh (en)**, **Tiếng Trung (zh)**.
  - Tự động phát hiện ngôn ngữ qua Header `Accept-Language` hoặc Query Param `?lng=zh`.
  - Log hệ thống (Console) cũng được hiển thị theo ngôn ngữ mặc định.
- **SQLite Database**: Lưu trữ lịch sử giao dịch nhẹ nhàng, hiệu năng cao (`better-sqlite3`), không cần cài đặt SQL Server/MySQL phức tạp.
- **Smart Queue & Scheduler**:
  - Hàng đợi xử lý thẻ (Queue) để tránh gửi quá nhanh.
  - Tác vụ định kỳ (Scheduler) tự động kiểm tra lại thẻ treo (Pending) mỗi 5 phút.
  - Tự động Retry callback thất bại.
  - Tự động dọn dẹp log và data cũ để tiết kiệm dung lượng.
- **Ngrok Tunnel**: Tự động tạo đường hầm HTTPs công khai để nhận callback khi chạy local (Development).
- **Validation**: Kiểm tra dữ liệu đầu vào chặt chẽ bằng `Zod`.

- **Node.js**: Phiên bản 18.x trở lên
- **NPM**: Phiên bản 9.x trở lên

## 📦 Cài đặt

1.  **Cài đặt dependencies**:
    ```bash
    npm install
    ```

2.  **Cấu hình môi trường**:
    - Copy file `.env.example` thành `.env`:
        ```bash
        cp .env.example .env
        ```
    - Chỉnh sửa file `.env` và điền thông tin cần thiết:
        ```env
        # API TheSieuToc
        THESIEUTOC_API_KEY=your_api_key_here

        # Server
        PORT=3000
        
        # Ngôn ngữ mặc định cho phản hồi API (vi, en, zh)
        DEFAULT_LANGUAGE=vi
        
        # Ngrok (Nếu muốn nhận callback khi dev local)
        # Lấy token tại: https://dashboard.ngrok.com/get-started/your-authtoken
        NGROK_AUTH_TOKEN=your_ngrok_token
        NGROK_DOMAIN=your_static_domain (nếu có)
        ```

3.  **Chạy ứng dụng**:

    - **Môi trường Development** (Hot-reload, tự động chạy Ngrok nếu có config):
        ```bash
        npm run dev
        ```
    - **Môi trường Production**:
        ```bash
        npm run build
        npm start
        ```

## 🔌 API Documentation

Base URL mặc định: `http://localhost:3000/api`

### 1. Gửi thẻ cào (`POST /card`)
Gửi thông tin thẻ lên hệ thống để đổi thưởng.
- **URL**: `/api/card`
- **Body**:
    ```json
    {
        "telco": "VIETTEL",
        "code": "1234567890123",
        "serial": "1234567890",
        "amount": 10000,
        "request_id": "TRANS123" // Tự sinh nếu không gửi
    }
    ```
- **Response**: Trả về `status`, `message`, và `trans_id` của TheSieuToc.

### 2. Callback (`POST /callback`)
Endpoint để TheSieuToc gọi về khi thẻ có kết quả (Thành công/Thất bại/Sai mệnh giá).
- **URL**: `/api/callback`
- **Lưu ý**: Endpoint này cần public ra internet. Nếu dùng `npm run dev`, hệ thống sẽ log ra URL Ngrok (ví dụ: `https://abcd-123.ngrok-free.app/api/callback`), bạn cần cài đặt URL này trong trang quản trị TheSieuToc.

### 3. Kiểm tra trạng thái thẻ (`POST /card/status`)
Chủ động kiểm tra trạng thái thẻ nếu chưa nhận được callback.
- **URL**: `/api/card/status`
- **Body**:
    ```json
    {
        "serial": "1234567890",
        "telco": "VIETTEL"
    }
    // Hoặc gửi request_id
    {
        "request_id": "TRANS123"
    }
    ```

### 4. Lấy bảng chiết khấu (`GET /card/discount/:account?`)
- **URL**: `/api/card/discount` (hoặc thêm account type vào cuối)

### 5. Lịch sử giao dịch (`GET /history`)
Xem danh sách các thẻ đã gửi.
- **URL**: `/api/history`
### 7. System Info (`GET /system/info`)
Xem thông tin trạng thái hệ thống (Uptime, RAM, Redis, Queue).
- **URL**: `/system/info`

### 8. Tìm kiếm giao dịch (`GET /transaction/search`)
- **URL**: `/api/transaction/search`
- **Params**:
    - `serial`: Tìm theo serial
    - `pin`: Tìm theo mã thẻ
    - `trans_id`: Tìm theo mã giao dịch
    - `status`: Lọc theo trạng thái (0: Pending, 1: Success, 2: Failed, 3: Wrong Amount)

### 9. Chi tiết Log giao dịch (`GET /transaction/:id/logs`)
- **URL**: `/api/transaction/:id/logs` (id là ID số trong database)

## 🧪 Testing

Trong thư mục `tests/` có sẵn các script để test nhanh API:

- `test-api.ps1`: Script PowerShell để test toàn bộ luồng (gửi thẻ, check status, callback giả lập).
- `test-real-card.ps1`: Script test gửi thẻ thật (cần sửa lại thông tin thẻ trong file).
- `test-api.sh`: Script Shell cho Linux/Mac.

Cách chạy (trên Windows PowerShell):
```powershell
.\tests\test-api.ps1
```

## 📝 Log & Debugging

- Log được lưu tại thư mục `logs/`.
- `app.log`: Log hoạt động chung.
- `error.log`: Log lỗi chi tiết.
- `cardsuccess.log`: Log riêng cho các thẻ Nạp Thẻ Thành Công (để dễ đối soát).

## 📄 License

Project này được chuyển đổi và tối ưu hóa từ phiên bản PHP gốc.
MIT License.
