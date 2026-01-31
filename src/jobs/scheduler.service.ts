/**
 * Scheduler Service
 * - Kiểm tra các giao dịch đang chờ
 * - Tự động retry callback thất bại
 * - Dọn dẹp dữ liệu cũ
 */

import * as cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { db } from '../database/index.js';
import { logger } from '../common/utils/logger.js';
import { checkCardStatus } from '../modules/card/thesieutoc.service.js';
import { updateTransactionStatus } from '../modules/transaction/transaction.service.js';
import { getDueCallbackRetries, rescheduleCallbackRetry } from './queue.service.js';
import { TransactionStatus } from '../database/index.js';
import { CHECK_STATUS } from '../common/types/index.js';
import axios from 'axios';

// ============================================================
// Cấu hình Scheduler
// ============================================================

interface ScheduledTask {
    name: string;
    cronExpression: string;
    task: cron.ScheduledTask | null;
    enabled: boolean;
}

const scheduledTasks: ScheduledTask[] = [];

// ============================================================
// 1. Kiểm tra giao dịch đang chờ
// Chạy mỗi 5 phút
// ============================================================

async function checkPendingTransactions(): Promise<void> {
    logger.info('[Scheduler] Đang kiểm tra các giao dịch chờ xử lý...');

    try {
        // Lấy các giao dịch đang chờ từ database
        const stmt = db.prepare(`
            SELECT trans_id, date
            FROM trans_log
            WHERE status = ?
            AND datetime(date) > datetime('now', '-24 hours', 'localtime')
        `);
        const pendingTxs = stmt.all(TransactionStatus.PENDING) as {
            trans_id: string;
            date: string;
        }[];

        logger.info(`[Scheduler] Tìm thấy ${pendingTxs.length} giao dịch đang chờ`);

        let successCount = 0;
        let failedCount = 0;
        let stillPending = 0;

        for (const tx of pendingTxs) {
            try {
                // Kiểm tra trạng thái với TheSieuToc API
                const status = await checkCardStatus(tx.trans_id);

                if (status.status === CHECK_STATUS.SUCCESS) {
                    updateTransactionStatus(tx.trans_id, TransactionStatus.SUCCESS);
                    successCount++;
                    logger.info(`[Scheduler] Giao dịch ${tx.trans_id} -> THÀNH CÔNG`);
                } else if (status.status === CHECK_STATUS.FAILED) {
                    updateTransactionStatus(tx.trans_id, TransactionStatus.FAILED);
                    failedCount++;
                    logger.info(`[Scheduler] Giao dịch ${tx.trans_id} -> THẤT BẠI`);
                } else if (status.status === CHECK_STATUS.WRONG_AMOUNT) {
                    updateTransactionStatus(tx.trans_id, TransactionStatus.WRONG_AMOUNT);
                    failedCount++;
                    logger.info(`[Scheduler] Giao dịch ${tx.trans_id} -> SAI MỆNH GIÁ`);
                } else {
                    stillPending++;
                }

                // Rate limit: chờ 500ms giữa các API calls
                await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
                logger.error(`[Scheduler] Lỗi khi kiểm tra ${tx.trans_id}: ${error}`);
            }
        }

        logger.info(
            `[Scheduler] Hoàn tất: ${successCount} thành công, ` +
                `${failedCount} thất bại, ${stillPending} vẫn đang chờ`
        );
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong checkPendingTransactions: ${error}`);
    }
}

// ============================================================
// 2. Retry Callback thất bại
// Chạy mỗi phút
// ============================================================

async function retryFailedCallbacks(): Promise<void> {
    try {
        const dueRetries = await getDueCallbackRetries();

        if (dueRetries.length === 0) return;

        logger.info(`[Scheduler] Đang xử lý ${dueRetries.length} callback cần retry`);

        for (const job of dueRetries) {
            try {
                const response = await axios.post(job.callbackUrl, job.payload, {
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' },
                });

                if (response.status >= 200 && response.status < 300) {
                    logger.info(`[Scheduler] Callback retry thành công: ${job.transactionId}`);
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định';
                await rescheduleCallbackRetry(job, errorMessage);
            }
        }
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong retryFailedCallbacks: ${error}`);
    }
}

// ============================================================
// 3. Dọn dẹp dữ liệu cũ
// Chạy hàng ngày lúc 3:00 sáng
// ============================================================

interface CleanupConfig {
    transactionDays: number; // Số ngày giữ giao dịch
    logDays: number; // Số ngày giữ log files
    blacklistDays: number; // Số ngày giữ blacklist
}

const defaultCleanupConfig: CleanupConfig = {
    transactionDays: 90, // 3 tháng
    logDays: 30, // 1 tháng
    blacklistDays: 180, // 6 tháng
};

async function cleanupOldData(config: CleanupConfig = defaultCleanupConfig): Promise<void> {
    logger.info('[Scheduler] Bắt đầu dọn dẹp dữ liệu cũ...');

    try {
        // 1. Xóa giao dịch cũ
        const txStmt = db.prepare(`
            DELETE FROM trans_log
            WHERE datetime(date) < datetime('now', '-' || ? || ' days', 'localtime')
            AND status != ?
        `);
        const txResult = txStmt.run(config.transactionDays, TransactionStatus.PENDING);
        if (txResult.changes > 0) {
            logger.info(`[Cleanup] Đã xóa ${txResult.changes} giao dịch cũ`);
        }

        // 2. Xóa blacklist cũ (nếu table tồn tại)
        try {
            const blStmt = db.prepare(`
                DELETE FROM card_blacklist
                WHERE datetime(created_at) < datetime('now', '-' || ? || ' days', 'localtime')
            `);
            const blResult = blStmt.run(config.blacklistDays);
            if (blResult.changes > 0) {
                logger.info(`[Cleanup] Đã xóa ${blResult.changes} blacklist cũ`);
            }
        } catch {
            // Table có thể chưa tồn tại
        }

        // 3. Xóa log files cũ
        await cleanupLogFiles(config.logDays);

        // 4. Tối ưu database
        db.exec('VACUUM');
        logger.info('[Cleanup] Đã tối ưu database');

        logger.info('[Scheduler] Dọn dẹp hoàn tất');
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong cleanupOldData: ${error}`);
    }
}

async function cleanupLogFiles(daysToKeep: number): Promise<void> {
    const logsDir = path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logsDir)) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const files = fs.readdirSync(logsDir);
    let deletedCount = 0;

    for (const file of files) {
        // Bỏ qua các file log quan trọng (không xóa)
        // cardsuccess.log: Lưu tất cả thẻ nạp thành công - KHÔNG BAO GIỜ XÓA
        // payossuccess.log: Lưu tất cả thanh toán PayOS thành công - KHÔNG BAO GIỜ XÓA
        const protectedFiles = [
            'combined.log',
            'error.log',
            'card.log',
            'cardsuccess.log', // File này KHÔNG bị xóa
            'payos.log',
            'payossuccess.log', // File này KHÔNG bị xóa
        ];
        if (protectedFiles.includes(file)) {
            continue;
        }

        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
        }
    }

    if (deletedCount > 0) {
        logger.info(`[Cleanup] Đã xóa ${deletedCount} file log cũ`);
    }
}

// ============================================================
// 4. Bảo trì Database
// Chạy hàng tuần vào Chủ nhật lúc 4:00 sáng
// ============================================================

async function databaseMaintenance(): Promise<void> {
    logger.info('[Scheduler] Bắt đầu bảo trì database...');

    try {
        // Phân tích tables để tối ưu query
        db.exec('ANALYZE');
        logger.info('[Maintenance] Đã phân tích tables');

        // Xây dựng lại indexes
        db.exec('REINDEX');
        logger.info('[Maintenance] Đã xây dựng lại indexes');

        // Kiểm tra tính toàn vẹn
        const integrityCheck = db.pragma('integrity_check') as { integrity_check: string }[];
        if (integrityCheck[0]?.integrity_check === 'ok') {
            logger.info('[Maintenance] Kiểm tra toàn vẹn database: OK');
        } else {
            logger.error(
                `[Maintenance] Kiểm tra toàn vẹn thất bại: ${JSON.stringify(integrityCheck)}`
            );
        }

        logger.info('[Scheduler] Bảo trì database hoàn tất');
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong databaseMaintenance: ${error}`);
    }
}

// ============================================================
// 5. Thống kê hàng ngày
// Chạy mỗi ngày lúc 00:05
// ============================================================

async function generateDailyStats(): Promise<void> {
    logger.info('[Scheduler] Đang tạo thống kê hàng ngày...');

    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        const stats = db
            .prepare(
                `
            SELECT
                COUNT(*) as total_transactions,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = 1 THEN amount ELSE 0 END) as total_success_amount,
                type
            FROM trans_log
            WHERE date(date) = ?
            GROUP BY type
        `
            )
            .all(dateStr) as {
            total_transactions: number;
            success_count: number;
            failed_count: number;
            pending_count: number;
            total_success_amount: number;
            type: string;
        }[];

        logger.info(`[Stats] Thống kê ngày ${dateStr}:`);
        for (const stat of stats) {
            logger.info(
                `[Stats] - ${stat.type}: ${stat.success_count}/${stat.total_transactions} (${stat.total_success_amount.toLocaleString()}đ)`
            );
        }
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong generateDailyStats: ${error}`);
    }
}

// ============================================================
// Quản lý Scheduler
// ============================================================

export function startScheduler(): void {
    logger.info('[Scheduler] Bắt đầu scheduler...');

    // Kiểm tra giao dịch đang chờ - mỗi 5 phút
    const pendingTask = cron.schedule('*/5 * * * *', checkPendingTransactions, {
        timezone: 'Asia/Ho_Chi_Minh',
    });
    scheduledTasks.push({
        name: 'checkPendingTransactions',
        cronExpression: '*/5 * * * *',
        task: pendingTask,
        enabled: true,
    });

    // Retry callback thất bại - mỗi phút
    const callbackTask = cron.schedule('* * * * *', retryFailedCallbacks, {
        timezone: 'Asia/Ho_Chi_Minh',
    });
    scheduledTasks.push({
        name: 'retryFailedCallbacks',
        cronExpression: '* * * * *',
        task: callbackTask,
        enabled: true,
    });

    // Dọn dẹp dữ liệu cũ - hàng ngày lúc 3:00 AM
    const cleanupTask = cron.schedule('0 3 * * *', () => cleanupOldData(), {
        timezone: 'Asia/Ho_Chi_Minh',
    });
    scheduledTasks.push({
        name: 'cleanupOldData',
        cronExpression: '0 3 * * *',
        task: cleanupTask,
        enabled: true,
    });

    // Bảo trì database - Chủ nhật lúc 4:00 AM
    const maintenanceTask = cron.schedule('0 4 * * 0', databaseMaintenance, {
        timezone: 'Asia/Ho_Chi_Minh',
    });
    scheduledTasks.push({
        name: 'databaseMaintenance',
        cronExpression: '0 4 * * 0',
        task: maintenanceTask,
        enabled: true,
    });

    // Thống kê hàng ngày - mỗi ngày lúc 00:05
    const statsTask = cron.schedule('5 0 * * *', generateDailyStats, {
        timezone: 'Asia/Ho_Chi_Minh',
    });
    scheduledTasks.push({
        name: 'generateDailyStats',
        cronExpression: '5 0 * * *',
        task: statsTask,
        enabled: true,
    });

    logger.info(`[Scheduler] Đã khởi động ${scheduledTasks.length} tác vụ định kỳ`);
}

export function stopScheduler(): void {
    for (const task of scheduledTasks) {
        if (task.task) {
            task.task.stop();
            task.enabled = false;
        }
    }
    scheduledTasks.length = 0;
    logger.info('[Scheduler] Đã dừng scheduler');
}

export function getSchedulerStatus(): Array<{
    name: string;
    cronExpression: string;
    enabled: boolean;
}> {
    return scheduledTasks.map((t) => ({
        name: t.name,
        cronExpression: t.cronExpression,
        enabled: t.enabled,
    }));
}

// ============================================================
// Hàm trigger thủ công (cho testing hoặc admin)
// ============================================================

export async function triggerPendingCheck(): Promise<void> {
    await checkPendingTransactions();
}

export async function triggerCleanup(config?: CleanupConfig): Promise<void> {
    await cleanupOldData(config);
}

export async function triggerDailyStats(): Promise<void> {
    await generateDailyStats();
}
