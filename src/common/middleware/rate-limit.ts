import { rateLimit } from 'express-rate-limit';

/**
 * Global Rate Limiter
 * Giới hạn chung cho toàn bộ API (ví dụ: checking status, history)
 */
export const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    limit: 100, // Tối đa 100 requests mỗi 15 phút per IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        code: 'TOO_MANY_REQUESTS',
        message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
    },
});

/**
 * Strict Rate Limiter
 * Giới hạn khắt khe cho các tác vụ nhạy cảm như tạo thanh toán hoặc gửi thẻ
 */
export const strictRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    limit: 5, // Tối đa 5 lần mỗi phút per IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Thao tác quá nhanh. Vui lòng đợi 1 phút để tiếp tục.',
    },
});
