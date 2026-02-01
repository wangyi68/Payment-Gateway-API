/**
 * Scheduler Service
 * - Kiểm tra các giao dịch đang chờ (Card & PayOS)
 * - Tự động retry callback thất bại
 * - Dọn dẹp dữ liệu cũ
 * - Báo cáo doanh thu hàng ngày
 */

import * as cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { db } from '../database/index.js';
import { logger } from '../common/utils/logger.js';
import { checkCardStatus } from '../modules/thesieutoc/thesieutoc.service.js';
import { updateTransactionStatus } from '../modules/transaction/transaction.service.js';
import { payOSService } from '../modules/payos/payos.service.js';
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
// 1. THẺ CÀO (THESIEUTOC)
// ============================================================

/**
 * Kiểm tra các giao dịch thẻ đang chờ (Polling fallback)
 * Chạy mỗi 5 phút
 */
async function checkPendingCards(): Promise<void> {
    logger.info('[Scheduler] Đang quét các thẻ đang chờ xử lý...');

    try {
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

        if (pendingTxs.length > 0) {
            logger.info(`[Scheduler] Tìm thấy ${pendingTxs.length} thẻ cần kiểm tra lại`);
        } else {
            logger.info('[Scheduler] Hiện không có thẻ nào đang chờ');
        }

        let successCount = 0;
        let failedCount = 0;
        let stillPending = 0;

        for (const tx of pendingTxs) {
            try {
                const status = await checkCardStatus(tx.trans_id);

                if (status.status === CHECK_STATUS.SUCCESS) {
                    updateTransactionStatus({
                        idOrTransId: tx.trans_id,
                        status: TransactionStatus.SUCCESS,
                    });
                    successCount++;
                    logger.info(`[Scheduler] Thẻ ${tx.trans_id} -> THÀNH CÔNG`);
                } else if (status.status === CHECK_STATUS.FAILED) {
                    updateTransactionStatus({
                        idOrTransId: tx.trans_id,
                        status: TransactionStatus.FAILED,
                    });
                    failedCount++;
                    logger.info(`[Scheduler] Thẻ ${tx.trans_id} -> THẤT BẠI`);
                } else if (status.status === CHECK_STATUS.WRONG_AMOUNT) {
                    updateTransactionStatus({
                        idOrTransId: tx.trans_id,
                        status: TransactionStatus.WRONG_AMOUNT,
                    });
                    failedCount++;
                    logger.info(`[Scheduler] Thẻ ${tx.trans_id} -> SAI MỆNH GIÁ`);
                } else {
                    stillPending++;
                }

                await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
                logger.error(`[Scheduler] Lỗi khi kiểm tra ${tx.trans_id}: ${error}`);
            }
        }

        if (pendingTxs.length > 0) {
            logger.info(
                `[Scheduler] Kết quả quét: ${successCount} đúng, ${failedCount} lỗi, ${stillPending} vẫn đang xử lý`
            );
        }

        // --- BỔ SUNG: Log thực tế từ DB ---
        const todayStats = db
            .prepare(
                `
            SELECT COUNT(*) as count 
            FROM trans_log 
            WHERE status IN (1, 3) AND date(date) = date('now', 'localtime')
        `
            )
            .get() as { count: number };

        logger.info(`[Scheduler] Tổng thẻ thành công hôm nay: ${todayStats.count}`);
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong checkPendingCards: ${error}`);
    }
}

// ============================================================
// 2. NGÂN HÀNG (PAYOS)
// ============================================================

/**
 * Kiểm tra các giao dịch PayOS đang chờ (Polling fallback)
 * Chạy mỗi 10 phút
 */
async function checkPendingPayOSOrders(): Promise<void> {
    logger.info('[Scheduler] Đang quét các đơn hàng PayOS PENDING...');

    try {
        const pendingOrders = payOSService.getPendingPayOSOrders(15);

        if (pendingOrders.length > 0) {
            logger.info(`[Scheduler] Tìm thấy ${pendingOrders.length} đơn cần đồng bộ lại`);
        } else {
            logger.info('[Scheduler] Hiện tại không có đơn PayOS nào bị treo (>15 phút)');
        }

        for (const order of pendingOrders) {
            try {
                const paymentInfo = await payOSService.getPaymentLinkInformation(order.orderCode);

                if (paymentInfo.status === 'PAID') {
                    await payOSService.updatePaymentStatus(order.orderCode, 'SUCCESS', paymentInfo);
                    logger.info(`[Scheduler] Đơn PayOS ${order.orderCode} -> THÀNH CÔNG (Sync)`);
                } else if (paymentInfo.status === 'CANCELLED' || paymentInfo.status === 'EXPIRED') {
                    await payOSService.updatePaymentStatus(
                        order.orderCode,
                        'CANCELLED',
                        paymentInfo
                    );
                    logger.info(
                        `[Scheduler] Đơn PayOS ${order.orderCode} -> ĐÃ HỦY/HẾT HẠN (Sync)`
                    );
                }
            } catch (error) {
                logger.error(`[Scheduler] Lỗi khi polling đơn ${order.orderCode}: ${error}`);
            }
        }

        // --- BỔ SUNG: Log thực tế từ DB ---
        const todayPayOS = db
            .prepare(
                `
            SELECT COUNT(*) as count 
            FROM payos_log 
            WHERE status = 'SUCCESS' AND date(createdAt) = date('now', 'localtime')
        `
            )
            .get() as { count: number };

        logger.info(`[Scheduler] Tổng đơn PayOS thành công hôm nay: ${todayPayOS.count}`);
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong checkPendingPayOSOrders: ${error}`);
    }
}

/**
 * Tự động hủy đơn hàng PayOS hết hạn
 * Chạy mỗi 30 phút
 */
async function autoExpirePayOSOrders(): Promise<void> {
    try {
        logger.info('[Scheduler] Đang dọn dẹp các đơn PayOS quá hạn...');
        payOSService.cancelExpiredPayOSOrders(60);
    } catch (error) {
        logger.error(`[Scheduler] Lỗi trong autoExpirePayOSOrders: ${error}`);
    }
}

// ============================================================
// 3. CALLBACK RETRY & CLEANUP
// ============================================================

async function retryFailedCallbacks(): Promise<void> {
    try {
        const dueRetries = await getDueCallbackRetries();
        if (dueRetries.length === 0) return;

        logger.info(`[Scheduler] Đang retry ${dueRetries.length} callback thất bại...`);

        for (const job of dueRetries) {
            try {
                const response = await axios.post(job.callbackUrl, job.payload, {
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' },
                });

                if (response.status >= 200 && response.status < 300) {
                    logger.info(`[Scheduler] Retry thành công: ${job.transactionId}`);
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định';
                await rescheduleCallbackRetry(job, errorMessage);
            }
        }
    } catch (error) {
        logger.error(`[Scheduler] Lỗi retryFailedCallbacks: ${error}`);
    }
}

async function cleanupOldData(): Promise<void> {
    logger.info('[Scheduler] Bắt đầu dọn dẹp dữ liệu cũ...');
    try {
        // Xóa thẻ cào cũ (>90 ngày)
        const txResult = db
            .prepare(
                `
            DELETE FROM trans_log 
            WHERE datetime(date) < datetime('now', '-90 days', 'localtime')
            AND status != ?
        `
            )
            .run(TransactionStatus.PENDING);

        // Xóa đơn PayOS cũ (>90 ngày)
        const payosResult = db
            .prepare(
                `
            DELETE FROM payos_log
            WHERE datetime(createdAt) < datetime('now', '-90 days', 'localtime')
            AND status != 'PENDING'
        `
            )
            .run();

        if (txResult.changes > 0 || payosResult.changes > 0) {
            logger.info(
                `[Scheduler] Đã dọn dẹp ${txResult.changes} thẻ và ${payosResult.changes} đơn PayOS.`
            );
        }

        // Dọn dẹp logs
        await cleanupLogFiles(30);

        db.exec('VACUUM');
        logger.info('[Scheduler] Đã tối ưu database (VACUUM)');
    } catch (error) {
        logger.error(`[Scheduler] Lỗi dọn dẹp: ${error}`);
    }
}

async function cleanupLogFiles(daysToKeep: number): Promise<void> {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const files = fs.readdirSync(logsDir);
    const protectedFiles = ['cardsuccess.log', 'payossuccess.log'];

    for (const file of files) {
        if (protectedFiles.includes(file)) continue;
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
        }
    }
}

// ============================================================
// 4. THỐNG KÊ DOANH THU
// ============================================================

async function generateDailyStats(): Promise<void> {
    logger.info('[Scheduler] Đang tính toán doanh thu ngày hôm qua...');
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        const cardStats = db
            .prepare(
                `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status IN (1, 3) THEN amount ELSE 0 END) as total_amount,
                SUM(CASE WHEN status IN (1, 3) THEN net_amount ELSE 0 END) as total_net
            FROM trans_log WHERE date(date) = ?
        `
            )
            .get(dateStr) as { total: number; total_amount: number; total_net: number };

        const payosStats = db
            .prepare(
                `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) as total_amount
            FROM payos_log WHERE date(createdAt) = ?
        `
            )
            .get(dateStr) as { total: number; total_amount: number };

        logger.info(`[Scheduler] --- BÁO CÁO DOANH THU ${dateStr} ---`);
        logger.info(
            `[Scheduler] 💳 Thẻ cào: ${(cardStats.total_amount || 0).toLocaleString()}đ (Thực nhận: ${(cardStats.total_net || 0).toLocaleString()}đ)`
        );
        logger.info(`[Scheduler] 🏦 Ngân hàng: ${(payosStats.total_amount || 0).toLocaleString()}đ`);
        logger.info(
            `[Scheduler] 💰 Tổng thực thu: ${(
                (cardStats.total_net || 0) + (payosStats.total_amount || 0)
            ).toLocaleString()}đ`
        );
    } catch (error) {
        logger.error(`[Scheduler] Lỗi thống kê: ${error}`);
    }
}

// ============================================================
// QUẢN LÝ SCHEDULER
// ============================================================

export function startScheduler(): void {
    logger.info('[Scheduler] Hệ thống tác vụ định kỳ đã khởi động');

    // Quét thẻ cào (5p)
    scheduledTasks.push({
        name: 'TheSieuToc_Polling',
        cronExpression: '*/5 * * * *',
        task: cron.schedule('*/5 * * * *', checkPendingCards, { timezone: 'Asia/Ho_Chi_Minh' }),
        enabled: true,
    });

    // Quét ngân hàng (10p)
    scheduledTasks.push({
        name: 'PayOS_Polling',
        cronExpression: '*/10 * * * *',
        task: cron.schedule('*/10 * * * *', checkPendingPayOSOrders, {
            timezone: 'Asia/Ho_Chi_Minh',
        }),
        enabled: true,
    });

    // Hủy đơn hết hạn (30p)
    scheduledTasks.push({
        name: 'PayOS_Cleanup',
        cronExpression: '*/30 * * * *',
        task: cron.schedule('*/30 * * * *', autoExpirePayOSOrders, {
            timezone: 'Asia/Ho_Chi_Minh',
        }),
        enabled: true,
    });

    // Retry callbacks (mỗi phút)
    scheduledTasks.push({
        name: 'Callback_Retry',
        cronExpression: '* * * * *',
        task: cron.schedule('* * * * *', retryFailedCallbacks, { timezone: 'Asia/Ho_Chi_Minh' }),
        enabled: true,
    });

    // Thống kê & Dọn dẹp (Hàng ngày)
    scheduledTasks.push({
        name: 'Daily_Stats',
        cronExpression: '5 0 * * *',
        task: cron.schedule('5 0 * * *', generateDailyStats, { timezone: 'Asia/Ho_Chi_Minh' }),
        enabled: true,
    });

    scheduledTasks.push({
        name: 'Daily_Cleanup',
        cronExpression: '0 3 * * *',
        task: cron.schedule('0 3 * * *', cleanupOldData, { timezone: 'Asia/Ho_Chi_Minh' }),
        enabled: true,
    });
}

export function stopScheduler(): void {
    for (const task of scheduledTasks) {
        if (task.task) task.task.stop();
    }
    scheduledTasks.length = 0;
    logger.info('[Scheduler] Đã dừng toàn bộ tác vụ');
}

export async function triggerPendingCheck(): Promise<void> {
    await checkPendingCards();
    await checkPendingPayOSOrders();
}

export async function triggerDailyStats(): Promise<void> {
    await generateDailyStats();
}

/**
 * Lấy danh sách trạng thái các tác vụ đang chạy
 */
export function getSchedulerStatus() {
    return scheduledTasks.map((t) => ({
        name: t.name,
        cronExpression: t.cronExpression,
        enabled: t.enabled,
    }));
}


