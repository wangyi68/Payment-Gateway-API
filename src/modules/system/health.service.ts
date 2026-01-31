import { Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import axios from 'axios';
import { db } from '../../database/index.js';
import { isRedisAvailable, getQueueStats, getRedis } from '../../jobs/queue.service.js';
import { getSchedulerStatus } from '../../jobs/scheduler.service.js';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';

// ============================================================
// Types & Interfaces
// ============================================================

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    uptimeHuman: string;
    version: string;
    environment: string;
    services: {
        database: ServiceStatus;
        redis: ServiceStatus;
        thesieutoc: ServiceStatus;
        payos: ServiceStatus;
        ngrok: ServiceStatus;
    };
    system: SystemInfo;
    queues?: QueueInfo;
    scheduler?: SchedulerInfo;
    database?: DatabaseInfo;
}

interface ServiceStatus {
    status: 'up' | 'down' | 'unknown' | 'not_configured';
    latency?: number;
    message?: string;
    details?: Record<string, unknown>;
}

interface SystemInfo {
    memory: {
        total: string;
        used: string;
        free: string;
        usagePercent: number;
        processRss: string;
        processHeapUsed: string;
        processHeapTotal: string;
    };
    cpu: {
        cores: number;
        model: string;
        loadAvg: number[];
        usagePercent?: number;
    };
    disk?: {
        total: string;
        free: string;
        usagePercent: number;
    };
    platform: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    pid: number;
}

interface QueueInfo {
    batch: number;
    callbackRetry: number;
    pendingCheck: number;
    failed: number;
    redisConnected: boolean;
}

interface SchedulerInfo {
    enabled: boolean;
    tasks: Array<{
        name: string;
        cronExpression: string;
        enabled: boolean;
    }>;
}

interface DatabaseInfo {
    type: 'sqlite';
    path: string;
    sizeBytes: number;
    sizeHuman: string;
    tables: {
        name: string;
        rowCount: number;
    }[];
    lastTransaction?: {
        id: number;
        createdAt: string;
    };
}

// ============================================================
// Check Functions
// ============================================================

/**
 * Check database connection and get stats
 */
async function checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
        // Test query
        const result = db.prepare('SELECT 1 as check_value').get() as { check_value: number };

        if (result?.check_value === 1) {
            return {
                status: 'up',
                latency: Date.now() - start,
            };
        }
        return { status: 'down', message: 'Invalid response' };
    } catch (error) {
        return {
            status: 'down',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get detailed database info
 */
function getDatabaseInfo(): DatabaseInfo | undefined {
    try {
        // Get database file size
        let sizeBytes = 0;
        const dbPath = config.database.path;

        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            sizeBytes = stats.size;
        }

        // Get table row counts
        const tables: { name: string; rowCount: number }[] = [];

        const tableNames = ['transactions', 'payos_log', 'card_blacklist'] as const;
        for (const tableName of tableNames) {
            try {
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as {
                    count: number;
                };
                tables.push({ name: tableName, rowCount: count?.count || 0 });
            } catch {
                // Table might not exist
            }
        }

        // Get last transaction
        let lastTransaction: { id: number; createdAt: string } | undefined;
        try {
            const last = db
                .prepare(
                    'SELECT id, created_at as createdAt FROM transactions ORDER BY id DESC LIMIT 1'
                )
                .get() as { id: number; createdAt: string } | undefined;

            if (last) {
                lastTransaction = last;
            }
        } catch {
            // Table might not exist
        }

        return {
            type: 'sqlite',
            path: dbPath,
            sizeBytes,
            sizeHuman: formatBytes(sizeBytes),
            tables,
            lastTransaction,
        };
    } catch {
        return undefined;
    }
}

/**
 * Check Redis connection
 */
async function checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
        if (!config.redis) {
            return {
                status: 'not_configured',
                message: 'Redis chưa được cấu hình, sử dụng In-Memory Queue',
            };
        }

        const redis = getRedis();
        if (redis && isRedisAvailable()) {
            // Ping Redis
            await redis.ping();

            return {
                status: 'up',
                latency: Date.now() - start,
                details: {
                    host: config.redis.host,
                    port: config.redis.port,
                },
            };
        }

        return {
            status: 'down',
            message: 'Redis không kết nối được',
        };
    } catch (error) {
        return {
            status: 'down',
            latency: Date.now() - start,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Check TheSieuToc API availability
 */
async function checkTheSieuToc(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
        const response = await axios.get(`${config.thesieutoc.baseUrl}/topup/discount`, {
            timeout: 5000,
        });

        if (response.status === 200) {
            return {
                status: 'up',
                latency: Date.now() - start,
                message: 'API accessible',
            };
        }
        return { status: 'down', message: `HTTP ${response.status}` };
    } catch (error) {
        return {
            status: 'down',
            latency: Date.now() - start,
            message: error instanceof Error ? error.message : 'Connection failed',
        };
    }
}

/**
 * Check PayOS configuration and connectivity
 */
async function checkPayOS(): Promise<ServiceStatus> {
    try {
        const hasConfig = Boolean(
            config.payos.clientId && config.payos.apiKey && config.payos.checksumKey
        );

        if (!hasConfig) {
            return {
                status: 'not_configured',
                message: 'PayOS credentials chưa được cấu hình',
            };
        }

        return {
            status: 'up',
            message: 'Configured',
            details: {
                clientId: config.payos.clientId.substring(0, 8) + '...',
            },
        };
    } catch (error) {
        return {
            status: 'down',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Check Ngrok tunnel status
 */
async function checkNgrok(): Promise<ServiceStatus> {
    try {
        if (!config.ngrok.authToken) {
            return {
                status: 'not_configured',
                message: 'Ngrok auth token chưa được cấu hình',
            };
        }

        // Ngrok doesn't have a simple health check
        // Just check if config is present
        return {
            status: 'up',
            message: config.ngrok.domain
                ? `Static domain: ${config.ngrok.domain}`
                : 'Dynamic domain',
        };
    } catch (error) {
        return {
            status: 'unknown',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format uptime to human readable
 */
function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(' ');
}

/**
 * Get system information
 */
function getSystemInfo(): SystemInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = process.memoryUsage();
    const cpus = os.cpus();

    return {
        memory: {
            total: formatBytes(totalMem),
            used: formatBytes(usedMem),
            free: formatBytes(freeMem),
            usagePercent: Math.round((usedMem / totalMem) * 100),
            processRss: formatBytes(memUsage.rss),
            processHeapUsed: formatBytes(memUsage.heapUsed),
            processHeapTotal: formatBytes(memUsage.heapTotal),
        },
        cpu: {
            cores: cpus.length,
            model: cpus[0]?.model || 'Unknown',
            loadAvg: os.loadavg(),
        },
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        pid: process.pid,
    };
}

// ============================================================
// Health Check Handlers
// ============================================================

/**
 * Detailed Health Check Endpoint
 * GET /health
 */
export async function healthCheckHandler(_req: Request, res: Response): Promise<void> {
    try {
        // Run all checks in parallel
        const [dbStatus, redisStatus, thesieutocStatus, payosStatus, ngrokStatus, queueStats] =
            await Promise.all([
                checkDatabase(),
                checkRedis(),
                checkTheSieuToc(),
                checkPayOS(),
                checkNgrok(),
                getQueueStats(),
            ]);

        // Get system info
        const systemInfo = getSystemInfo();
        const uptime = process.uptime();

        // Get scheduler status
        const schedulerTasks = getSchedulerStatus();

        // Get database info
        const databaseInfo = getDatabaseInfo();

        // Determine overall health status
        const criticalServices = [dbStatus];
        const allServices = [dbStatus, redisStatus, thesieutocStatus, payosStatus];

        let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

        if (criticalServices.some((s) => s.status === 'down')) {
            overallStatus = 'unhealthy';
        } else if (allServices.some((s) => s.status === 'down')) {
            overallStatus = 'degraded';
        }

        const health: HealthStatus = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime,
            uptimeHuman: formatUptime(uptime),
            version: '1.0.0',
            environment: config.server.nodeEnv,
            services: {
                database: dbStatus,
                redis: redisStatus,
                thesieutoc: thesieutocStatus,
                payos: payosStatus,
                ngrok: ngrokStatus,
            },
            system: systemInfo,
            queues: {
                batch: queueStats.batchQueue,
                callbackRetry: queueStats.callbackRetryQueue,
                pendingCheck: queueStats.pendingCheckQueue,
                failed: queueStats.failedJobs,
                redisConnected: queueStats.redisConnected,
            },
            scheduler: {
                enabled: config.scheduler.enabled,
                tasks: schedulerTasks,
            },
            database: databaseInfo,
        };

        const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
        res.status(statusCode).json(health);
    } catch (error) {
        logger.error('[Health Check] Error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Simple liveness probe
 * GET /health/live
 *
 * Chỉ kiểm tra process còn chạy không
 * Dùng cho Kubernetes liveness probe
 */
export function livenessHandler(_req: Request, res: Response): void {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid,
    });
}

/**
 * Readiness probe - checks if app is ready to receive traffic
 * GET /health/ready
 *
 * Kiểm tra database và các dependencies critical
 * Dùng cho Kubernetes readiness probe
 */
export async function readinessHandler(_req: Request, res: Response): Promise<void> {
    try {
        const dbStatus = await checkDatabase();

        if (dbStatus.status === 'up') {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString(),
                checks: {
                    database: dbStatus,
                },
            });
        } else {
            res.status(503).json({
                status: 'not ready',
                reason: 'Database unavailable',
                timestamp: new Date().toISOString(),
                checks: {
                    database: dbStatus,
                },
            });
        }
    } catch {
        res.status(503).json({
            status: 'not ready',
            error: 'Health check failed',
            timestamp: new Date().toISOString(),
        });
    }
}

/**
 * Simple ping endpoint
 * GET /health/ping
 */
export function pingHandler(_req: Request, res: Response): void {
    res.status(200).send('pong');
}

/**
 * Version endpoint
 * GET /health/version
 */
export function versionHandler(_req: Request, res: Response): void {
    res.status(200).json({
        version: '1.0.0',
        name: 'Payment Gateway API',
        description: 'Card (TheSieuToc) + Bank/QR (PayOS)',
        environment: config.server.nodeEnv,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
    });
}
