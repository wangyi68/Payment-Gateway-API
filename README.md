# TheSieuToc API Gateway (TypeScript Version)

Phiên bản TypeScript của API Gateway tích hợp với [TheSieuToc.net](https://thesieutoc.net).
Project này được viết lại từ phiên bản PHP cũ để tăng hiệu năng, an toàn kiểu dữ liệu và dễ dàng mở rộng.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg)

## 🚀 Tính Năng Chính

- **Full API TheSieuToc**: Gửi thẻ, kiểm tra trạng thái, lấy chiết khấu.
- **Webhook Callback**: Xử lý callback từ TheSieuToc tự động, hỗ trợ cập nhật trạng thái giao dịch và ghi log chi tiết.
- **TypeScript**: Codebase an toàn, dễ bảo trì với `strict` mode và Zod validation.
- **Tiếng Việt Toàn Diện**: Tất cả log hệ thống, thông báo lỗi và phản hồi API đều bằng tiếng Việt.
- **SQLite Database**: Lưu trữ lịch sử giao dịch nhẹ nhàng, hiệu năng cao (`better-sqlite3`).
- **Smart Queue & Scheduler**:
  - Hàng đợi xử lý thẻ (Queue) hỗ trợ Redis hoặc In-Memory fallback.
  - Tác vụ định kỳ (Scheduler) tự động kiểm tra lại thẻ treo (Pending) mỗi 5 phút.
  - Tự động Retry callback thất bại với exponential backoff.
  - Tự động dọn dẹp log và data cũ để tối ưu dung lượng.
- **Ngrok Tunnel**: Tự động tạo đường hầm HTTPs công khai với static domain support để nhận callback khi chạy local.
- **Security**: Tích hợp `helmet`, `cors` và request logging để đảm bảo an toàn.

## 📋 Yêu cầu hệ thống

- **Node.js**: Phiên bản 18.x trở lên
- **NPM**: Phiên bản 9.x trở lên
- **Redis**: Tùy chọn (Nếu không có sẽ dùng bộ nhớ trong)

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
    - Chỉnh sửa file `.env` và điền thông tin:
        ```env
        THESIEUTOC_API_KEY=your_api_key_here
        PORT=3000
        NGROK_AUTH_TOKEN=your_ngrok_token
        NGROK_DOMAIN=your_static_domain.ngrok-free.dev
        ```

3.  **Chạy ứng dụng**:
    - **Development**: `npm run dev`
    - **Production**: `npm run build` sau đó `npm start`
    - **Database Migration**: `npm run db:migrate` (Khởi tạo hoặc cập nhật cấu trúc database manually)

## 🔌 API Documentation

Base URL: `http://localhost:3000/api`

### 1. Gửi thẻ cào (`POST /card`)
```json
{
    "username": "user123",
    "card_type": "Viettel",
    "card_amount": "10000",
    "serial": "12345678901",
    "pin": "123456789012"
}
```
*Lưu ý: card_amount phải là chuỗi số (ví dụ: "10000").*

### 2. Lấy chiết khấu (`GET /card/discount/:account?`)
Lấy bảng chiết khấu mặc định hoặc theo tài khoản.

### 3. Kiểm tra trạng thái thẻ (`POST /card/status`)
```json
{
    "transaction_id": "TS_1738159000_ABC"
}
```

### 4. Lịch sử giao dịch (`GET /history`)
Xem 10-100 giao dịch gần nhất. Param: `?limit=20`.

### 5. Tìm kiếm giao dịch (`GET /transaction/search`)
Params: `serial`, `pin`, `trans_id`, `status` (0:Pending, 1:Success, 2:Failed, 3:Wrong Amount).

### 6. System Info (`GET /api/system/info`)
Xem trạng thái server, RAM, Redis và Queue.

## 🧪 Testing

Sử dụng các script trong thư mục `tests/`:
- `test-api.ps1`: Chạy bộ test tự động trên Windows.
- `test-real-card.ps1`: Test gửi thẻ thật.
- `test-api.sh`: Phiên bản Linux/macOS.

## 📝 Log & Debugging

- `logs/app.log`: Log hoạt động chung.
- `logs/error.log`: Log lỗi hệ thống.
- `logs/cardsuccess.log`: **Log riêng cho thẻ thành công/sai mệnh giá** (dùng để đối soát, không bị tự động xóa).

## 📄 License

MIT License.
