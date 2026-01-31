/**
 * Custom Error Classes
 * Centralized error handling với status codes và error types
 */

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly code: string;

    constructor(
        message: string,
        statusCode: number = 500,
        code: string = 'INTERNAL_ERROR',
        isOperational: boolean = true
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

// 400 - Bad Request
export class BadRequestError extends AppError {
    constructor(message: string = 'Yêu cầu không hợp lệ', code: string = 'BAD_REQUEST') {
        super(message, 400, code);
    }
}

// 401 - Unauthorized
export class UnauthorizedError extends AppError {
    constructor(message: string = 'Chưa xác thực', code: string = 'UNAUTHORIZED') {
        super(message, 401, code);
    }
}

// 403 - Forbidden
export class ForbiddenError extends AppError {
    constructor(message: string = 'Không có quyền truy cập', code: string = 'FORBIDDEN') {
        super(message, 403, code);
    }
}

// 404 - Not Found
export class NotFoundError extends AppError {
    constructor(message: string = 'Không tìm thấy', code: string = 'NOT_FOUND') {
        super(message, 404, code);
    }
}

// 409 - Conflict
export class ConflictError extends AppError {
    constructor(message: string = 'Xung đột dữ liệu', code: string = 'CONFLICT') {
        super(message, 409, code);
    }
}

// 422 - Validation Error
export class ValidationError extends AppError {
    public readonly errors: string[];

    constructor(errors: string[], message: string = 'Dữ liệu không hợp lệ') {
        super(message, 422, 'VALIDATION_ERROR');
        this.errors = errors;
    }
}

// 429 - Too Many Requests
export class RateLimitError extends AppError {
    constructor(
        message: string = 'Quá nhiều yêu cầu, vui lòng thử lại sau',
        code: string = 'RATE_LIMIT'
    ) {
        super(message, 429, code);
    }
}

// 500 - Internal Server Error
export class InternalError extends AppError {
    constructor(message: string = 'Lỗi máy chủ nội bộ', code: string = 'INTERNAL_ERROR') {
        super(message, 500, code, false);
    }
}

// 502 - Bad Gateway (External API Error)
export class ExternalApiError extends AppError {
    public readonly service: string;

    constructor(service: string, message: string = 'Lỗi kết nối dịch vụ bên ngoài') {
        super(message, 502, 'EXTERNAL_API_ERROR');
        this.service = service;
    }
}

// 503 - Service Unavailable
export class ServiceUnavailableError extends AppError {
    constructor(
        message: string = 'Dịch vụ tạm thời không khả dụng',
        code: string = 'SERVICE_UNAVAILABLE'
    ) {
        super(message, 503, code);
    }
}

// Card-specific errors
export class CardError extends AppError {
    public readonly cardType?: string;
    public readonly serial?: string;

    constructor(
        message: string,
        code: string,
        statusCode: number = 400,
        cardType?: string,
        serial?: string
    ) {
        super(message, statusCode, code);
        this.cardType = cardType;
        this.serial = serial;
    }
}

export class DuplicateCardError extends CardError {
    constructor(serial: string, cardType: string) {
        super(
            `Thẻ ${cardType} với serial ${serial.slice(0, 4)}**** đã được sử dụng`,
            'DUPLICATE_CARD',
            409,
            cardType,
            serial
        );
    }
}

export class BlacklistedCardError extends CardError {
    constructor(reason: string = 'đã sử dụng') {
        super(`Thẻ đã bị chặn: ${reason}`, 'BLACKLISTED_CARD', 403);
    }
}

export class InvalidCardFormatError extends CardError {
    constructor(errors: string[]) {
        super(errors.join('; '), 'INVALID_CARD_FORMAT', 400);
    }
}

// Payment-specific errors
export class PaymentError extends AppError {
    public readonly orderCode?: number;

    constructor(message: string, code: string, orderCode?: number) {
        super(message, 400, code);
        this.orderCode = orderCode;
    }
}

// ============================================================
// PayOS-specific errors
// ============================================================

/**
 * Base PayOS Error
 */
export class PayOSError extends AppError {
    public readonly orderCode?: number;
    public readonly payosCode?: string;

    constructor(
        message: string,
        code: string = 'PAYOS_ERROR',
        statusCode: number = 400,
        orderCode?: number,
        payosCode?: string
    ) {
        super(message, statusCode, code);
        this.orderCode = orderCode;
        this.payosCode = payosCode;
    }
}

/**
 * PayOS Webhook Verification Error
 * Khi signature không hợp lệ hoặc dữ liệu bị thay đổi
 */
export class PayOSWebhookError extends PayOSError {
    public readonly webhookType: 'payment' | 'payout';

    constructor(
        message: string = 'Xác thực webhook PayOS thất bại',
        webhookType: 'payment' | 'payout' = 'payment',
        orderCode?: number
    ) {
        super(message, 'PAYOS_WEBHOOK_ERROR', 400, orderCode);
        this.webhookType = webhookType;
    }
}

/**
 * PayOS Signature Verification Error
 * Khi signature HMAC SHA256 không khớp
 */
export class PayOSSignatureError extends PayOSError {
    constructor(message: string = 'Chữ ký không hợp lệ', orderCode?: number) {
        super(message, 'PAYOS_SIGNATURE_INVALID', 401, orderCode);
    }
}

/**
 * PayOS Payment Failed Error
 * Khi thanh toán thất bại
 */
export class PayOSPaymentFailedError extends PayOSError {
    public readonly reason: string;

    constructor(reason: string, orderCode?: number, payosCode?: string) {
        super(`Thanh toán thất bại: ${reason}`, 'PAYOS_PAYMENT_FAILED', 400, orderCode, payosCode);
        this.reason = reason;
    }
}

/**
 * PayOS Payment Link Error
 * Khi tạo link thanh toán thất bại
 */
export class PayOSPaymentLinkError extends PayOSError {
    constructor(message: string = 'Không thể tạo link thanh toán', orderCode?: number) {
        super(message, 'PAYOS_CREATE_LINK_FAILED', 500, orderCode);
    }
}

/**
 * PayOS Order Not Found Error
 */
export class PayOSOrderNotFoundError extends PayOSError {
    constructor(orderCode: number) {
        super(`Không tìm thấy đơn hàng: ${orderCode}`, 'PAYOS_ORDER_NOT_FOUND', 404, orderCode);
    }
}

/**
 * PayOS Duplicate Order Error
 */
export class PayOSDuplicateOrderError extends PayOSError {
    constructor(orderCode: number) {
        super(`Đơn hàng đã tồn tại: ${orderCode}`, 'PAYOS_DUPLICATE_ORDER', 409, orderCode);
    }
}
