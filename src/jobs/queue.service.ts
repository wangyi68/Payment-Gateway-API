/**
 * Queue Service
 * - Redis queue cho xử lý batch
 * - Tự động retry callback thất bại
 * - Quản lý jobs
 */

import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import type { SubmitCardRequest } from '../common/types/index.js';

// ============================================================
// Kết nối Redis
// ============================================================

let redis: Redis | null = null;
let isRedisConnected = false;

export function initRedis(): Redis | null {
    if (!config.redis?.host) {
        logger.warn('[Queue] Redis chưa được cấu hình, sử dụng queue trong bộ nhớ');
        return null;
    }

    try {
        redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) {
                    logger.error('[Queue] Lỗi Redis: Connection failed after 3 retries');
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
        });

        redis.on('connect', () => {
            isRedisConnected = true;
            logger.info('[Queue] Đã kết nối Redis');
        });

        redis.on('error', (err) => {
            isRedisConnected = false;
            logger.error(`[Queue] Lỗi Redis: ${err}`);
        });

        redis.on('close', () => {
            isRedisConnected = false;
            logger.warn('[Queue] Kết nối Redis đã đóng');
        });

        return redis;
    } catch (error) {
        logger.error(`[Queue] Không thể khởi tạo Redis: ${error}`);
        return null;
    }
}

export function isRedisAvailable(): boolean {
    return isRedisConnected && redis !== null;
}

export function getRedis(): Redis | null {
    return redis;
}

// ============================================================
// Queue Keys
// ============================================================

export const QUEUE_KEYS = {
    CARD_BATCH: 'queue:card:batch',
    CALLBACK_RETRY: 'queue:callback:retry',
    PENDING_CHECK: 'queue:pending:check',
    FAILED_JOBS: 'queue:failed',
} as const;

// ============================================================
// In-Memory Queue (Fallback khi Redis không khả dụng)
// ============================================================

interface QueueJob<T = unknown> {
    id: string;
    data: T;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    lastAttempt?: Date;
    error?: string;
}

const memoryQueues: Map<string, QueueJob[]> = new Map();

function getMemoryQueue(key: string): QueueJob[] {
    let queue = memoryQueues.get(key);
    if (!queue) {
        queue = [];
        memoryQueues.set(key, queue);
    }
    return queue;
}

// ============================================================
// Card Batch Queue
// ============================================================

export interface BatchCardJob {
    id: string;
    cards: Array<SubmitCardRequest & { requestId: string }>;
    userId?: string;
    createdAt: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    results: Array<{
        requestId: string;
        success: boolean;
        transactionId?: string;
        error?: string;
    }>;
}

/**
 * Thêm batch card job vào queue
 */
export async function addBatchCardJob(
    cards: Array<SubmitCardRequest & { requestId: string }>,
    userId?: string
): Promise<string> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const job: BatchCardJob = {
        id: jobId,
        cards,
        userId,
        createdAt: new Date().toISOString(),
        status: 'pending',
        progress: 0,
        results: [],
    };

    if (isRedisAvailable() && redis) {
        await redis.lpush(QUEUE_KEYS.CARD_BATCH, JSON.stringify(job));
        await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400); // 24h TTL
        logger.info(`[Queue] Đã thêm batch job ${jobId} vào Redis (${cards.length} thẻ)`);
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CARD_BATCH);
        queue.push({
            id: jobId,
            data: job,
            attempts: 0,
            maxAttempts: 3,
            createdAt: new Date(),
        });
        logger.info(`[Queue] Đã thêm batch job ${jobId} vào memory (${cards.length} thẻ)`);
    }

    return jobId;
}

/**
 * Láy trạng thái batch job
 */
export async function getBatchJobStatus(jobId: string): Promise<BatchCardJob | null> {
    if (isRedisAvailable() && redis) {
        const data = await redis.get(`job:${jobId}`);
        return data ? JSON.parse(data) : null;
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CARD_BATCH);
        const job = queue.find((j) => j.id === jobId);
        return job ? (job.data as BatchCardJob) : null;
    }
}

/**
 * Lấy batch job tiếp theo từ queue
 */
export async function getNextBatchJob(): Promise<BatchCardJob | null> {
    if (isRedisAvailable() && redis) {
        const data = await redis.rpop(QUEUE_KEYS.CARD_BATCH);
        return data ? JSON.parse(data) : null;
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CARD_BATCH);
        const job = queue.shift();
        return job ? (job.data as BatchCardJob) : null;
    }
}

/**
 * Cập nhật trạng thái batch job
 */
export async function updateBatchJobStatus(
    jobId: string,
    updates: Partial<BatchCardJob>
): Promise<void> {
    if (isRedisAvailable() && redis) {
        const data = await redis.get(`job:${jobId}`);
        if (data) {
            const job = JSON.parse(data) as BatchCardJob;
            Object.assign(job, updates);
            await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);
        }
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CARD_BATCH);
        const jobWrapper = queue.find((j) => j.id === jobId);
        if (jobWrapper) {
            Object.assign(jobWrapper.data as BatchCardJob, updates);
        }
    }
}

// ============================================================
// Callback Retry Queue
// ============================================================

export interface CallbackRetryJob {
    id: string;
    transactionId: string;
    callbackUrl: string;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
    nextRetry: string;
    error?: string;
}

/**
 * Thêm callback thất bại vào retry queue
 */
export async function addCallbackRetry(
    transactionId: string,
    callbackUrl: string,
    payload: unknown,
    maxAttempts: number = 5
): Promise<string> {
    const jobId = `retry_${transactionId}_${Date.now()}`;
    const job: CallbackRetryJob = {
        id: jobId,
        transactionId,
        callbackUrl,
        payload,
        attempts: 0,
        maxAttempts,
        nextRetry: new Date(Date.now() + 60000).toISOString(), // 1 phút
    };

    if (isRedisAvailable() && redis) {
        await redis.zadd(
            QUEUE_KEYS.CALLBACK_RETRY,
            Date.now() + 60000, // Score = thời gian retry tiếp theo
            JSON.stringify(job)
        );
        logger.info(`[Queue] Đã lên lịch retry callback cho ${transactionId}`);
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CALLBACK_RETRY);
        queue.push({
            id: jobId,
            data: job,
            attempts: 0,
            maxAttempts,
            createdAt: new Date(),
        });
        logger.info(`[Queue] Đã thêm retry callback cho ${transactionId} vào memory`);
    }

    return jobId;
}

/**
 * Láy các callback retry đã đến hạn
 */
export async function getDueCallbackRetries(): Promise<CallbackRetryJob[]> {
    const now = Date.now();
    const retries: CallbackRetryJob[] = [];

    if (isRedisAvailable() && redis) {
        const jobs = await redis.zrangebyscore(QUEUE_KEYS.CALLBACK_RETRY, 0, now);
        for (const jobStr of jobs) {
            retries.push(JSON.parse(jobStr));
        }
        // Xóa các jobs đã lấy
        if (jobs.length > 0) {
            await redis.zremrangebyscore(QUEUE_KEYS.CALLBACK_RETRY, 0, now);
        }
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CALLBACK_RETRY);
        const dueJobs = queue.filter((j) => {
            const job = j.data as CallbackRetryJob;
            return new Date(job.nextRetry).getTime() <= now;
        });
        for (const j of dueJobs) {
            retries.push(j.data as CallbackRetryJob);
            const idx = queue.indexOf(j);
            if (idx > -1) queue.splice(idx, 1);
        }
    }

    return retries;
}

/**
 * Lên lịch lại callback retry với exponential backoff
 */
export async function rescheduleCallbackRetry(job: CallbackRetryJob, error: string): Promise<void> {
    job.attempts++;
    job.error = error;

    if (job.attempts >= job.maxAttempts) {
        // Chuyển vào queue thất bại
        if (isRedisAvailable() && redis) {
            await redis.lpush(QUEUE_KEYS.FAILED_JOBS, JSON.stringify(job));
        } else {
            const queue = getMemoryQueue(QUEUE_KEYS.FAILED_JOBS);
            queue.push({
                id: job.id,
                data: job,
                attempts: job.attempts,
                maxAttempts: job.maxAttempts,
                createdAt: new Date(),
            });
        }
        logger.error(
            `[Queue] Callback ${job.transactionId} thất bại sau ${job.maxAttempts} lần thử`
        );
        return;
    }

    // Exponential backoff: 1 phút, 2 phút, 4 phút, 8 phút, 16 phút
    const delay = Math.pow(2, job.attempts) * 60000;
    job.nextRetry = new Date(Date.now() + delay).toISOString();

    if (isRedisAvailable() && redis) {
        await redis.zadd(QUEUE_KEYS.CALLBACK_RETRY, Date.now() + delay, JSON.stringify(job));
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.CALLBACK_RETRY);
        queue.push({
            id: job.id,
            data: job,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            createdAt: new Date(),
        });
    }

    logger.warn(
        `[Queue] Callback ${job.transactionId} đã lên lịch lại (lần ${job.attempts}/${job.maxAttempts})`
    );
}

// ============================================================
// Pending Check Queue
// ============================================================

export interface PendingCheckJob {
    transactionId: string;
    checkCount: number;
    lastCheck: string;
    createdAt: string;
}

/**
 * Thêm giao dịch vào pending check queue
 */
export async function addPendingCheck(transactionId: string): Promise<void> {
    const job: PendingCheckJob = {
        transactionId,
        checkCount: 0,
        lastCheck: new Date().toISOString(),
        createdAt: new Date().toISOString(),
    };

    if (isRedisAvailable() && redis) {
        await redis.hset(QUEUE_KEYS.PENDING_CHECK, transactionId, JSON.stringify(job));
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.PENDING_CHECK);
        queue.push({
            id: transactionId,
            data: job,
            attempts: 0,
            maxAttempts: 10,
            createdAt: new Date(),
        });
    }
}

/**
 * Lấy tất cả pending checks
 */
export async function getAllPendingChecks(): Promise<PendingCheckJob[]> {
    const jobs: PendingCheckJob[] = [];

    if (isRedisAvailable() && redis) {
        const all = await redis.hgetall(QUEUE_KEYS.PENDING_CHECK);
        for (const value of Object.values(all)) {
            jobs.push(JSON.parse(value));
        }
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.PENDING_CHECK);
        for (const j of queue) {
            jobs.push(j.data as PendingCheckJob);
        }
    }

    return jobs;
}

/**
 * Cập nhật pending check
 */
export async function updatePendingCheck(
    transactionId: string,
    updates: Partial<PendingCheckJob>
): Promise<void> {
    if (isRedisAvailable() && redis) {
        const data = await redis.hget(QUEUE_KEYS.PENDING_CHECK, transactionId);
        if (data) {
            const job = JSON.parse(data) as PendingCheckJob;
            Object.assign(job, updates);
            await redis.hset(QUEUE_KEYS.PENDING_CHECK, transactionId, JSON.stringify(job));
        }
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.PENDING_CHECK);
        const jobWrapper = queue.find((j) => j.id === transactionId);
        if (jobWrapper) {
            Object.assign(jobWrapper.data as PendingCheckJob, updates);
        }
    }
}

/**
 * Xóa khỏi pending check
 */
export async function removePendingCheck(transactionId: string): Promise<void> {
    if (isRedisAvailable() && redis) {
        await redis.hdel(QUEUE_KEYS.PENDING_CHECK, transactionId);
    } else {
        const queue = getMemoryQueue(QUEUE_KEYS.PENDING_CHECK);
        const idx = queue.findIndex((j) => j.id === transactionId);
        if (idx > -1) queue.splice(idx, 1);
    }
}

// ============================================================
// Thống kê Queue
// ============================================================

export async function getQueueStats(): Promise<{
    batchQueue: number;
    callbackRetryQueue: number;
    pendingCheckQueue: number;
    failedJobs: number;
    redisConnected: boolean;
}> {
    let batchQueue = 0;
    let callbackRetryQueue = 0;
    let pendingCheckQueue = 0;
    let failedJobs = 0;

    if (isRedisAvailable() && redis) {
        batchQueue = await redis.llen(QUEUE_KEYS.CARD_BATCH);
        callbackRetryQueue = await redis.zcard(QUEUE_KEYS.CALLBACK_RETRY);
        pendingCheckQueue = await redis.hlen(QUEUE_KEYS.PENDING_CHECK);
        failedJobs = await redis.llen(QUEUE_KEYS.FAILED_JOBS);
    } else {
        batchQueue = getMemoryQueue(QUEUE_KEYS.CARD_BATCH).length;
        callbackRetryQueue = getMemoryQueue(QUEUE_KEYS.CALLBACK_RETRY).length;
        pendingCheckQueue = getMemoryQueue(QUEUE_KEYS.PENDING_CHECK).length;
        failedJobs = getMemoryQueue(QUEUE_KEYS.FAILED_JOBS).length;
    }

    return {
        batchQueue,
        callbackRetryQueue,
        pendingCheckQueue,
        failedJobs,
        redisConnected: isRedisConnected,
    };
}

// ============================================================
// Đóng kết nối
// ============================================================

export async function closeRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
        isRedisConnected = false;
        logger.info('[Queue] Đã đóng kết nối Redis');
    }
}


