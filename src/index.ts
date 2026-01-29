import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import ngrok from '@ngrok/ngrok';
import { config } from './config/index.js';
import { initializeDatabase } from './database/index.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler, requestLogger } from './middleware/index.js';
import { initBlacklistTable } from './services/validation.service.js';
import { initRedis, closeRedis } from './services/queue.service.js';
import { startScheduler, stopScheduler } from './services/scheduler.service.js';

// Initialize database
initializeDatabase();

// Initialize blacklist table
initBlacklistTable();

// Initialize Redis (optional)
initRedis();

// Create Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// API routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'TheSieuToc API',
        version: '1.0.0',
        endpoints: {
            'POST /api/card': 'Gửi thẻ cào',
            'GET /api/card/discount/:account?': 'Lấy chiết khấu',
            'POST /api/card/status': 'Kiểm tra trạng thái thẻ',
            'GET /api/history': 'Lịch sử giao dịch',
            'POST /api/callback': 'Callback từ TheSieuToc',
            'GET /health': 'Health check',
        },
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
            logger.info(`📡 Callback URL: ${publicUrl}/api/callback`);

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

