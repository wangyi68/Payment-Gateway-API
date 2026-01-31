import { Request, Response } from 'express';
import os from 'os';
import { getQueueStats } from '../../jobs/queue.service.js';
import { db } from '../../database/index.js';
import { ApiResponse } from '../../common/types/index.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Get system information
 * GET /system/info
 */
export async function getSystemInfoHandler(
    _req: Request,
    res: Response<ApiResponse>
): Promise<void> {
    try {
        const queueStats = await getQueueStats();

        // System stats
        const uptime = process.uptime();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // Database simple check
        let dbStatus = 'unknown';
        try {
            const result = db.prepare('SELECT 1').get();
            dbStatus = result ? 'connected' : 'error';
        } catch {
            dbStatus = 'error';
        }

        res.json({
            success: true,
            message: 'Thông tin hệ thống',
            data: {
                server: {
                    uptime: uptime,
                    uptime_human: formatUptime(uptime),
                    memory: {
                        total: formatBytes(totalMem),
                        used: formatBytes(usedMem),
                        free: formatBytes(freeMem),
                        percent_used: Math.round((usedMem / totalMem) * 100) + '%',
                    },
                    load_avg: os.loadavg(),
                    platform: os.platform(),
                    arch: os.arch(),
                    node_version: process.version,
                },
                services: {
                    database: dbStatus,
                    redis: queueStats.redisConnected ? 'connected' : 'disconnected',
                },
                queues: {
                    batch: queueStats.batchQueue,
                    callback_retry: queueStats.callbackRetryQueue,
                    pending_check: queueStats.pendingCheckQueue,
                    failed: queueStats.failedJobs,
                },
            },
        });
    } catch (error) {
        logger.error('[System Info] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Không thể lấy thông tin hệ thống',
        });
    }
}

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

function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
