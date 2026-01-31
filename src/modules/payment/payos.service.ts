import { PayOS } from '@payos/node';
import { config } from '../../config/index.js';
import { db } from '../../database/index.js';
import { logger } from '../../common/utils/logger.js';
import { getBankName } from '../../common/utils/bank-helper.js';
import {
    PayOSSignatureError,
    PayOSPaymentLinkError,
    PayOSOrderNotFoundError,
    PayOSDuplicateOrderError,
} from '../../common/errors/index.js';

// ============================================================
// PayOS Webhook Types
// ============================================================

export interface PayOSWebhookPayload {
    code: string; // '00' = success
    desc: string;
    success: boolean;
    signature: string;
    data: PayOSPaymentData;
}

export interface PayOSPaymentData {
    orderCode: number;
    amount: number;
    description: string;
    accountNumber: string;
    reference: string;
    transactionDateTime: string;
    currency: string;
    paymentLinkId: string;
    code: string;
    desc: string;
    counterAccountBankId?: string | null;
    counterAccountBankName?: string | null;
    counterAccountName?: string | null;
    counterAccountNumber?: string | null;
    virtualAccountName?: string | null;
    virtualAccountNumber?: string | null;
}

// ============================================================
// PayOS Response Codes
// ============================================================

export const PAYOS_CODES = {
    SUCCESS: '00',
    PENDING: '01',
    FAILED: '02',
    CANCELLED: '03',
} as const;

export type PayOSCode = (typeof PAYOS_CODES)[keyof typeof PAYOS_CODES];

// ============================================================
// PayOS Service Class
// ============================================================

export class PayOSService {
    private payOS: PayOS; // Payment Request Instance
    constructor() {
        this.payOS = new PayOS({
            clientId: config.payos.clientId,
            apiKey: config.payos.apiKey,
            checksumKey: config.payos.checksumKey,
        });
    }

    // ================= Payment Request Methods =================

    async createPaymentLink(
        orderCode: number,
        amount: number,
        description: string,
        returnUrl: string,
        cancelUrl: string
    ) {
        // Check duplicate order
        const existingOrder = db
            .prepare('SELECT orderCode FROM payos_log WHERE orderCode = ?')
            .get(orderCode);

        if (existingOrder) {
            throw new PayOSDuplicateOrderError(orderCode);
        }

        const body = {
            orderCode,
            amount,
            description,
            returnUrl,
            cancelUrl,
        };

        try {
            const paymentLinkResponse = await this.payOS.paymentRequests.create(body);

            // Save to DB
            const stmt = db.prepare(`
                INSERT INTO payos_log(orderCode, amount, description, status, checkoutUrl, createdAt, updatedAt)
                VALUES(?, ?, ?, 'PENDING', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            `);
            stmt.run(orderCode, amount, description, paymentLinkResponse.checkoutUrl);

            logger.info(`[PayOS] Tạo link thanh toán: orderCode=${orderCode}, amount=${amount}`);

            return paymentLinkResponse;
        } catch (error) {
            logger.error('[PayOS] Lỗi tạo link thanh toán:', error);
            throw new PayOSPaymentLinkError(
                error instanceof Error ? error.message : 'Không thể tạo link thanh toán',
                orderCode
            );
        }
    }

    /**
     * Xác thực webhook payment request từ PayOS
     * Sử dụng SDK webhooks.verify
     */
    async verifyWebhookAsync(webhookBody: PayOSWebhookPayload) {
        try {
            const data = await this.payOS.webhooks.verify(webhookBody);
            logger.info(`[PayOS] Webhook verified: orderCode=${data.orderCode}`);
            return data;
        } catch (error) {
            logger.warn(`[PayOS] Verify failed: ${error}`);
            throw new PayOSSignatureError(
                error instanceof Error ? error.message : 'Invalid Signature'
            );
        }
    }

    /**
     * @deprecated Use verifyWebhookAsync instead
     */
    verifyPaymentWebhook(_webhookBody: PayOSWebhookPayload): PayOSPaymentData {
        throw new Error('Method deprecated. Use verifyWebhookAsync instead.');
    }

    async getPaymentLinkInformation(orderCode: string | number) {
        try {
            const code = typeof orderCode === 'string' ? parseInt(orderCode) : orderCode;
            const paymentLinkInfo = await this.payOS.paymentRequests.get(code);
            return paymentLinkInfo;
        } catch (error) {
            logger.error('[PayOS] Lỗi lấy thông tin thanh toán:', error);
            if (error instanceof Error && error.message.includes('not found')) {
                throw new PayOSOrderNotFoundError(
                    typeof orderCode === 'string' ? parseInt(orderCode) : orderCode
                );
            }
            throw error;
        }
    }

    async updatePaymentStatus(
        orderCode: number,
        status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED',
        transactionData?: Partial<PayOSPaymentData>
    ) {
        let paymentMethod = transactionData?.counterAccountBankName || null;

        // Nếu không có tên ngân hàng nhưng có ID (BIN)
        if (!paymentMethod && transactionData?.counterAccountBankId) {
            paymentMethod = await getBankName(transactionData.counterAccountBankId);
        }

        const stmt = db.prepare(`
            UPDATE payos_log 
            SET status = ?,
                reference = ?,
                payment_method = ?,
                counter_account_name = ?,
                counter_account_number = ?,
                transactionDateTime = ?,
                canceledAt = ?,
                updatedAt = datetime('now', 'localtime')
            WHERE orderCode = ?
        `);

        stmt.run(
            status,
            transactionData?.reference || null,
            paymentMethod,
            transactionData?.counterAccountName || null,
            transactionData?.counterAccountNumber || null,
            transactionData?.transactionDateTime || null,
            status === 'CANCELLED' ? new Date().toLocaleString('sv-SE') : null, // ISO-like local format
            orderCode
        );

        logger.info(`[PayOS] Cập nhật trạng thái: orderCode=${orderCode}, status=${status}`);
    }

    getOrderFromDB(orderCode: number) {
        return db.prepare('SELECT * FROM payos_log WHERE orderCode = ?').get(orderCode);
    }

    /**
     * Lấy danh sách các đơn hàng PayOS đang chờ xử lý
     * @param minutesAgo Số phút tối thiểu từ khi tạo (ví dụ: đã chờ quá 15 phút)
     */
    getPendingPayOSOrders(minutesAgo: number = 15) {
        return db
            .prepare(
                `
            SELECT orderCode, status
            FROM payos_log
            WHERE status = 'PENDING'
            AND datetime(createdAt) < datetime('now', '-' || ? || ' minutes', 'localtime')
            AND datetime(createdAt) > datetime('now', '-24 hours', 'localtime')
        `
            )
            .all(minutesAgo) as { orderCode: number; status: string }[];
    }

    /**
     * Tự động hủy các đơn hàng đã quá hạn thanh toán (ví dụ: quá 60 phút)
     */
    cancelExpiredPayOSOrders(expiryMinutes: number = 60) {
        const stmt = db.prepare(`
            UPDATE payos_log
            SET status = 'CANCELLED',
                canceledAt = datetime('now', 'localtime'),
                updatedAt = datetime('now', 'localtime')
            WHERE status = 'PENDING'
            AND datetime(createdAt) < datetime('now', '-' || ? || ' minutes', 'localtime')
        `);
        const result = stmt.run(expiryMinutes);
        if (result.changes > 0) {
            logger.info(
                `[PayOS] Đã tự động hủy ${result.changes} đơn hàng quá hạn (${expiryMinutes} phút)`
            );
        }
        return result.changes;
    }

    processWebhookResult(webhookBody: PayOSWebhookPayload): {
        status: 'SUCCESS' | 'FAILED' | 'PENDING';
        message: string;
        orderCode: number;
    } {
        const { code, desc, data } = webhookBody;
        let status: 'SUCCESS' | 'FAILED' | 'PENDING';
        let message: string;

        switch (code) {
            case PAYOS_CODES.SUCCESS:
                status = 'SUCCESS';
                message = desc || 'Thanh toán thành công';
                break;
            case PAYOS_CODES.PENDING:
                status = 'PENDING';
                message = desc || 'Đang chờ xử lý';
                break;
            case PAYOS_CODES.CANCELLED:
                status = 'FAILED';
                message = desc || 'Đã hủy';
                break;
            default:
                status = 'FAILED';
                message = desc || 'Thanh toán thất bại';
        }

        return {
            status,
            message,
            orderCode: data.orderCode,
        };
    }
}

export const payOSService = new PayOSService();
