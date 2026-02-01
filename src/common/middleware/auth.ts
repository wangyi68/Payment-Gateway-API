import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * API Key Auth Middleware
 * Kiểm tra mã bí mật trong header 'x-api-key' hoặc 'authorization'
 * Chỉ kích hoạt nếu API_SECRET_KEY được cấu hình trong .env
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const apiKey = config.security.apiKey;

    // Nếu không cấu hình key, cho qua (optional security)
    if (!apiKey) {
        return next();
    }

    const clientKey = req.headers['x-api-key'] || req.headers['authorization'];

    if (!clientKey || clientKey !== apiKey) {
        logger.warn(`[Auth] Truy cập bị từ chối từ IP: ${req.ip} - Path: ${req.path}`);
        res.status(401).json({
            success: false,
            code: 'UNAUTHORIZED',
            message: 'API Key không hợp lệ hoặc bị thiếu',
        });
        return;
    }

    next();
}
