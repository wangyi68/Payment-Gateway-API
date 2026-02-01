import { z } from 'zod';

// ============================================================
// Card Types & Amounts
// ============================================================

export const CardType = z.enum([
    'Viettel',
    'Mobifone',
    'Vinaphone',
    'Vietnamobile',
    'Zing',
    'Gate',
    'Garena',
    'Vcoin',
]);
export type CardType = z.infer<typeof CardType>;

export const CardAmount = z.enum([
    '10000',
    '20000',
    '30000',
    '50000',
    '100000',
    '200000',
    '300000',
    '500000',
    '1000000',
    '2000000', // Vcoin only
    '5000000', // Vcoin only
]);
export type CardAmount = z.infer<typeof CardAmount>;

// ============================================================
// 1.0 Get Discount - GET /topup/discount/{account?}
// ============================================================

export interface CardDiscount {
    card_type: string;
    discount: Record<string, string>; // { "10000": "12", "20000": "12", ... }
}

// ============================================================
// 1.1 Submit Card - POST /chargingws/v2
// ============================================================

export const SubmitCardRequest = z.object({
    username: z.string().min(1, 'Username is required').max(100),
    card_type: CardType,
    card_amount: CardAmount,
    serial: z.string().min(1, 'Serial is required'),
    pin: z.string().min(1, 'PIN is required'),
});
export type SubmitCardRequest = z.infer<typeof SubmitCardRequest>;

// TheSieuToc Submit Response
export interface TheSieuTocSubmitResponse {
    status: string;
    transaction_id?: string;
    amount?: number;
    title?: string;
    msg: string;
}

// TheSieuToc Submit Status Codes
export const SUBMIT_STATUS = {
    SUCCESS: '00', // Thẻ đã gửi lên hệ thống chờ xử lý
    NO_API_KEY: '54', // Chưa nhập API key
    INVALID_API: '1', // Sai thông tin API
    ACCOUNT_LOCKED: '3', // Tài khoản đã bị khóa
    MAINTENANCE: '-1089', // Thẻ đang bảo trì
    CARD_USED: '2', // Thẻ đã được sử dụng trên hệ thống
    NO_SERIAL: '56', // Chưa nhập Seri
    NO_PIN: '55', // Chưa nhập mã thẻ
    NO_AMOUNT: '52', // Chưa chọn mệnh giá
    UNKNOWN_ERROR: '47', // Lỗi không xác định
} as const;

// ============================================================
// 1.2 Callback - POST to your callback URL
// ============================================================

export const CallbackData = z.object({
    status: z.enum(['thanhcong', 'saimenhgia', 'thatbai']),
    serial: z.string(),
    pin: z.string(),
    card_type: z.string(),
    amount: z.string(), // Mệnh giá thẻ (cập nhật nếu sai mệnh giá)
    receive_amount: z.string().optional(), // Mệnh giá chấp nhận cộng tiền
    real_amount: z.string(), // Số tiền thực nhận sau trừ chiết khấu
    noidung: z.string().optional(), // Thông báo kết quả
    content: z.string(), // Mã đối chiếu (transaction_id)
});
export type CallbackData = z.infer<typeof CallbackData>;

// Callback Status
export const CALLBACK_STATUS = {
    SUCCESS: 'thanhcong', // Thẻ đúng
    WRONG_AMOUNT: 'saimenhgia', // Thẻ sai mệnh giá
    FAILED: 'thatbai', // Thẻ sai
} as const;

// ============================================================
// 1.3 Check Card Status - POST /chargingws/status_card
// ============================================================

export const CheckStatusRequest = z.object({
    transaction_id: z.string().min(1, 'Transaction ID is required'),
});
export type CheckStatusRequest = z.infer<typeof CheckStatusRequest>;

export interface CardStatusResponse {
    status: string;
    amount?: number; // Mệnh giá thật của thẻ
    msg?: string; // Ghi chú tình trạng thẻ
}

// Check Status Codes
export const CHECK_STATUS = {
    SUCCESS: '00', // Thẻ thành công
    WRONG_AMOUNT: '99', // Thẻ sai mệnh giá
    FAILED: '-10', // Thẻ sai
    PENDING: '-9', // Thẻ chờ duyệt
    ERROR: '2', // Lỗi không kiểm tra được
} as const;

// ============================================================
// Local Database Transaction
// ============================================================

export interface TransactionHistory {
    id: number | string;
    name: string;
    amount: number;
    seri: string;
    type: string;
    status: number;
    statusText: string;
    trans_id: string;
    date: string;
    method?: string; // 'card' or 'payos'
}

// ============================================================
// API Response Wrapper
// ============================================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
    code?: string; // TheSieuToc status code
}
