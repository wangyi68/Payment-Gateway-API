import winston from 'winston';
import { config } from '../config/index.js';

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
            level: 'error'
        }),
        new winston.transports.File({
            filename: 'logs/combined.log'
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
    transports: [
        new winston.transports.File({ filename: 'logs/card.log' }),
    ],
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
        `TRẠNG THÁI: ${data.callbackStatus === 'thanhcong' ? 'THÀNH CÔNG' : 'SAI MỆNH GIÁ'}`
    ].join(' | ');

    cardSuccessLogger.info(logEntry);
}

