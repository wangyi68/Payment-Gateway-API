import winston from 'winston';
import { config } from '../../config/index.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format to uppercase the level
const uppercaseLevel = winston.format((info) => {
    info.level = info.level.toUpperCase();
    return info;
})();

const customFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

// File format (no colors)
const fileFormat = combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    uppercaseLevel,
    customFormat
);

// Console format (with colors)
const consoleFormat = combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    uppercaseLevel,
    colorize({ level: true }),
    customFormat
);

export const logger = winston.createLogger({
    level: config.logging.level,
    format: fileFormat,
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
        }),
    ],
});

// Card-specific logger (tất cả giao dịch)
export const cardLogger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf(({ message, timestamp }) => `${timestamp} - ${message}`)
    ),
    transports: [new winston.transports.File({ filename: 'logs/card.log' })],
});

// Card Success Logger - Chỉ ghi thẻ nạp thành công
// File này KHÔNG bị xóa trong cleanup
export const cardSuccessLogger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf(({ message, timestamp }) => `${timestamp} | ${message}`)
    ),
    transports: [
        new winston.transports.File({
            filename: 'logs/cardsuccess.log',
            // Không giới hạn kích thước file
        }),
    ],
});

/**
 * Ghi log thẻ nạp thành công với đầy đủ thông tin
 */
export function logSuccessCard(data: {
    username: string;
    cardType: string;
    serial: string;
    pin: string;
    declaredAmount: number;
    actualAmount: number;
    realAmount: string;
    receiveAmount?: string;
    transactionId: string;
    callbackStatus: string;
}): void {
    const logEntry = [
        `USER: ${data.username}`,
        `LOẠI: ${data.cardType}`,
        `SERIAL: ${data.serial}`,
        `PIN: ${data.pin}`,
        `MỆNH GIÁ KHAI: ${data.declaredAmount.toLocaleString()}đ`,
        `MỆNH GIÁ THỰC: ${data.actualAmount.toLocaleString()}đ`,
        `SỐ TIỀN NHẬN: ${data.realAmount}đ`,
        `MÃ GD: ${data.transactionId}`,
        `TRẠNG THÁI: ${data.callbackStatus === 'thanhcong' ? 'THÀNH CÔNG' : 'SAI MỆNH GIÁ'}`,
    ].join(' | ');

    cardSuccessLogger.info(logEntry);
}

// ============================================================
// PayOS Loggers
// ============================================================

// PayOS transaction logger (tất cả giao dịch PayOS)
export const payosLogger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf(({ message, timestamp }) => `${timestamp} - ${message}`)
    ),
    transports: [new winston.transports.File({ filename: 'logs/payos.log' })],
});

// PayOS Success Logger - Chỉ ghi thanh toán thành công
// File này KHÔNG bị xóa trong cleanup
export const payosSuccessLogger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf(({ message, timestamp }) => `${timestamp} | ${message}`)
    ),
    transports: [
        new winston.transports.File({
            filename: 'logs/payossuccess.log',
        }),
    ],
});

/**
 * Ghi log thanh toán PayOS thành công
 */
export function logSuccessPayment(data: {
    orderCode: number;
    amount: number;
    description?: string;
    reference?: string;
    transactionDateTime?: string;
    status: string;
}): void {
    const logEntry = [
        `ORDER: ${data.orderCode}`,
        `SỐ TIỀN: ${data.amount.toLocaleString()}đ`,
        `MÔ TẢ: ${data.description || 'N/A'}`,
        `REFERENCE: ${data.reference || 'N/A'}`,
        `THỜI GIAN: ${data.transactionDateTime || 'N/A'}`,
        `TRẠNG THÁI: ${data.status}`,
    ].join(' | ');

    payosSuccessLogger.info(logEntry);
}

/**
 * Ghi log webhook PayOS
 */
export function logPayOSWebhook(
    type: 'PAYMENT' | 'PAYOUT',
    data: {
        orderCode?: number;
        code: string;
        desc: string;
        success: boolean;
        amount?: number;
    }
): void {
    const logEntry = [
        `[${type}]`,
        data.orderCode ? `ORDER: ${data.orderCode}` : '',
        `CODE: ${data.code}`,
        `DESC: ${data.desc}`,
        `SUCCESS: ${data.success}`,
        data.amount ? `AMOUNT: ${data.amount.toLocaleString()}đ` : '',
    ]
        .filter(Boolean)
        .join(' | ');

    payosLogger.info(logEntry);
}


