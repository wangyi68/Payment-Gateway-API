import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { AppError, ValidationError } from '../errors/index.js';

/**
 * Centralized Error Handler
 * Xử lý tất cả errors và trả về response format nhất quán
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    // Log error
    logger.error(`[${req.method}] ${req.path} - Error: ${err.message}`);

    if (err instanceof AppError) {
        // Custom AppError - đã có status code và thông tin
        const response: Record<string, unknown> = {
            success: false,
            code: err.code,
            message: err.message,
        };

        // Thêm validation errors nếu có
        if (err instanceof ValidationError) {
            response.errors = err.errors;
        }

        // Thêm stack trace trong development
        if (process.env.NODE_ENV === 'development') {
            response.stack = err.stack;
        }

        res.status(err.statusCode).json(response);
        return;
    }

    // Unexpected error - log full stack
    logger.error(err.stack);

    res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Lỗi máy chủ nội bộ',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}

/**
 * 404 Not Found Handler
 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
    res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} không tồn tại`,
    });
}

/**
 * Request Logger Middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
        logger[logLevel](`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
    });

    next();
}

/**
 * Async Handler Wrapper
 * Wrap async route handlers để tự động catch errors
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
