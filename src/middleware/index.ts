import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export function errorHandler(
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    logger.error(`[${req.method}] ${req.path} - ${statusCode}: ${message}`);
    logger.error(err.stack);

    res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
}

export function notFoundHandler(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.path} not found`,
    });
}

export function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(
            `[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`
        );
    });

    next();
}
