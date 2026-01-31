import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import ngrok from '@ngrok/ngrok';
import { config } from './config/index.js';
import { initializeDatabase } from './database/index.js';
import { logger } from './common/utils/logger.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler, requestLogger } from './common/middleware/index.js';
import { globalRateLimiter } from './common/middleware/rate-limit.js';
import { initBlacklistTable } from './modules/card/validation.service.js';
import { initRedis, closeRedis } from './jobs/queue.service.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.service.js';
import {
    healthCheckHandler,
    livenessHandler,
    readinessHandler,
    pingHandler,
    versionHandler,
} from './modules/system/health.service.js';

// Initialize database
initializeDatabase();

// Initialize blacklist table
initBlacklistTable();

// Initialize Redis (optional)
initRedis();

// Create Express app
const app = express();

/**
 * Trust Proxy - CỰC KỲ QUAN TRỌNG khi dùng express-rate-limit sau Ngrok/Proxy
 * Giúp lấy đúng IP thật của khách hàng thay vì IP của proxy
 */
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Static files
app.use(express.static('public'));

// API routes
app.use('/api', globalRateLimiter, routes);

// Health check endpoints
app.get('/health', healthCheckHandler);
app.get('/health/live', livenessHandler);
app.get('/health/ready', readinessHandler);
app.get('/health/ping', pingHandler);
app.get('/health/version', versionHandler);

// Root route - API info
app.get('/', (_req, res) => {
    res.json({
        name: 'Payment Gateway API',
        version: '1.0.0',
        description: 'Card (TheSieuToc) + Bank/QR (PayOS)',
        documentation: '/rest',
        health: '/health',
    });
});

// API Documentation route
app.get('/rest', (_req, res) => {
    res.json({
        name: 'Payment Gateway API',
        version: '1.1.0',
        description: 'Giải pháp tích hợp Thẻ cào (TheSieuToc) & Ngân hàng (PayOS)',
        endpoints: {
            card: {
                'POST /api/card': 'Gửi thẻ cào mới (Viettel, Mobifone, Vinaphone...)',
                'GET /api/card/discount': 'Lấy bảng chiết khấu thẻ cào hiện tại',
                'POST /api/card/status': 'Kiểm tra trạng thái thẻ cào bằng transaction_id',
                'POST /api/card/callback': 'Webhook nhận thông báo kết quả gạch thẻ',
            },
            transaction: {
                'GET /api/transaction/history': 'Lấy lịch sử giao dịch gần đây',
                'GET /api/transaction/search': 'Tìm kiếm giao dịch theo Serial hoặc ID',
                'GET /api/transaction/:id/logs': 'Xem chi tiết log của một giao dịch',
            },
            payos: {
                'POST /api/payos/checkout': 'Khởi tạo link thanh toán VietQR (PayOS)',
                'POST /api/payos/callback': 'Webhook nhận thông báo thanh toán thành công',
                'GET /api/payos/payment-info/:orderCode': 'Truy vấn thông tin đơn hàng từ PayOS API',
                'GET /api/payos/orders/:orderCode': 'Truy vấn thông tin đơn hàng từ database local',
            },
            health: {
                'GET /health': 'Tổng quan tình trạng hệ thống (Health Check)',
                'GET /health/live': 'Liveness probe cho Docker/K8s',
                'GET /health/ready': 'Readiness probe cho Docker/K8s',
                'GET /health/ping': 'Ping Check cơ bản',
                'GET /health/version': 'Thông tin phiên bản ứng dụng',
            },
            system: {
                'GET /api/system/info': 'Thông tin tài nguyên server và cấu hình',
            },
        },
        links: {
            home: '/',
            documentation: '/rest',
            health_check: '/health',
            readme: '/README.md'
        }
    });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
async function startServer() {
    const server = app.listen(config.server.port, config.server.host, () => {
        logger.info(`🚀 Server đang chạy tại http://${config.server.host}:${config.server.port}`);
        logger.info(`📝 Môi trường: ${config.server.nodeEnv}`);
    });

    // Start scheduler if enabled
    if (config.scheduler.enabled) {
        startScheduler();
    }

    // Start ngrok tunnel if auth token is provided
    if (config.ngrok.authToken) {
        try {
            // Build ngrok options
            const ngrokOptions: ngrok.Config = {
                addr: config.server.port,
                authtoken: config.ngrok.authToken,
            };

            // Use static domain if provided
            if (config.ngrok.domain) {
                ngrokOptions.domain = config.ngrok.domain;
            }

            const listener = await ngrok.connect(ngrokOptions);
            const publicUrl = listener.url();

            logger.info(`🌐 Ngrok tunnel: ${publicUrl}`);

            if (config.ngrok.domain) {
                logger.info(`📌 Sử dụng static domain: ${config.ngrok.domain}`);
            }
        } catch (error) {
            logger.error(`Không thể khởi động ngrok tunnel: ${error}`);
            logger.info(`Server tiếp tục chạy trên localhost`);
            if (!config.ngrok.authToken) {
                logger.warn(`⚠️ NGROK_AUTH_TOKEN chưa được thiết lập - ngrok tunnel đã tắt`);
            }
        }
    } else {
        logger.warn(`⚠️ NGROK_AUTH_TOKEN chưa được thiết lập - ngrok tunnel đã tắt`);
    }

    // Graceful shutdown
    const shutdown = async () => {
        logger.info(`Đang tắt server...`);

        // Stop scheduler
        stopScheduler();

        // Close Redis connection
        await closeRedis();

        // Disconnect ngrok
        await ngrok.disconnect();

        // Close server
        server.close(() => {
            logger.info(`Server đã đóng`);
            process.exit(0);
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

startServer().catch((error) => {
    logger.error(`Lỗi server: ${error}`);
    process.exit(1);
});

export default app;
