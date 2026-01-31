import { Router } from 'express';
import { getSystemInfoHandler } from './system.controller.js';
import {
    healthCheckHandler,
    livenessHandler,
    readinessHandler,
    pingHandler,
    versionHandler,
} from './health.service.js';

const router = Router();

// GET /api/system/info - Thông tin hệ thống
router.get('/info', getSystemInfoHandler);

// Health check endpoints (also mounted at root level /health/*)
// GET /api/system/health - Health check chi tiết
router.get('/health', healthCheckHandler);

// GET /api/system/health/live - Liveness probe
router.get('/health/live', livenessHandler);

// GET /api/system/health/ready - Readiness probe
router.get('/health/ready', readinessHandler);

// GET /api/system/health/ping - Simple ping
router.get('/health/ping', pingHandler);

// GET /api/system/health/version - Version info
router.get('/health/version', versionHandler);

export default router;
