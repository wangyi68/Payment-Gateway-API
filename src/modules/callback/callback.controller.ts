import { Request, Response } from 'express';
import { CallbackData, type ApiResponse, CALLBACK_STATUS } from '../../common/types/index.js';
import {
    findPendingTransaction,
    updateTransactionStatus,
} from '../transaction/transaction.service.js';
import { TransactionStatus } from '../../database/index.js';
import {
    logger,
    cardLogger,
    logSuccessCard,
    logPayOSWebhook,
    logSuccessPayment,
} from '../../common/utils/logger.js';
import { removePendingCheck } from '../../jobs/queue.service.js';
import { payOSService, PayOSWebhookPayload, PayOSPaymentData } from '../payment/payos.service.js';
import { PayOSSignatureError } from '../../common/errors/index.js';

// ============================================================
// TheSieuToc Callback Handler
// ============================================================

/**
 * TheSieuToc Callback Handler
 * POST /api/callback (legacy)
 * POST /api/card/callback
 *
 * Nhận callback từ TheSieuToc khi thẻ được xử lý xong
 *
 * Callback fields:
 * - status: "thanhcong" | "saimenhgia" | "thatbai"
 * - serial: Số serial thẻ
 * - pin: Mã thẻ
 * - card_type: Loại thẻ (Viettel, Mobifone, etc.)
 * - amount: Mệnh giá thẻ (cập nhật nếu sai mệnh giá)
 * - receive_amount: Mệnh giá chấp nhận cộng tiền
 * - real_amount: Số tiền thực nhận sau trừ chiết khấu
 * - noidung: Thông báo kết quả
 * - content: Mã đối chiếu (transaction_id)
 */
export function theSieuTocCallbackHandler(req: Request, res: Response<ApiResponse>): void {
    try {
        logger.info(`[TheSieuToc Callback] Nhận callback: ${JSON.stringify(req.body)}`);

        // Validate callback data
        const parseResult = CallbackData.safeParse(req.body);

        if (!parseResult.success) {
            logger.warn('[TheSieuToc Callback] Dữ liệu không hợp lệ:', parseResult.error.errors);
            res.status(400).json({
                success: false,
                message: 'Dữ liệu callback không hợp lệ',
                error: parseResult.error.errors.map((e) => `${e.path}: ${e.message}`).join(', '),
            });
            return;
        }

        const data = parseResult.data;

        // Find the pending transaction in local database
        const transaction = findPendingTransaction(
            data.content, // trans_id
            data.pin,
            data.serial,
            data.card_type
        );

        if (!transaction) {
            logger.warn(`[TheSieuToc Callback] Không tìm thấy giao dịch: ${data.content}`);
            res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch',
                error: `Không có giao dịch pending với mã: ${data.content}`,
            });
            return;
        }

        // Update transaction status based on callback
        let newStatus: TransactionStatus;
        const actualAmount: number = parseInt(data.amount);

        switch (data.status) {
            case CALLBACK_STATUS.SUCCESS:
                // Thẻ đúng - thành công
                newStatus = TransactionStatus.SUCCESS;
                updateTransactionStatus(transaction.id, newStatus);
                logger.info(
                    `[TheSieuToc Callback] THÀNH CÔNG: ${data.content}, Mệnh giá: ${data.amount}đ, Thực nhận: ${data.real_amount}đ`
                );

                // Ghi log thẻ thành công
                logSuccessCard({
                    username: transaction.name,
                    cardType: data.card_type,
                    serial: data.serial,
                    pin: data.pin,
                    declaredAmount: transaction.amount,
                    actualAmount: actualAmount,
                    realAmount: data.real_amount,
                    receiveAmount: data.receive_amount,
                    transactionId: data.content,
                    callbackStatus: data.status,
                });
                break;

            case CALLBACK_STATUS.WRONG_AMOUNT:
                // Thẻ sai mệnh giá - cập nhật mệnh giá thật
                newStatus = TransactionStatus.WRONG_AMOUNT;
                updateTransactionStatus(transaction.id, newStatus, actualAmount);
                logger.info(
                    `[TheSieuToc Callback] SAI MỆNH GIÁ: ${data.content}, Khai: ${transaction.amount}đ, Thực: ${actualAmount}đ`
                );

                // Ghi log thẻ sai mệnh giá (vẫn được tính tiền)
                logSuccessCard({
                    username: transaction.name,
                    cardType: data.card_type,
                    serial: data.serial,
                    pin: data.pin,
                    declaredAmount: transaction.amount,
                    actualAmount: actualAmount,
                    realAmount: data.real_amount,
                    receiveAmount: data.receive_amount,
                    transactionId: data.content,
                    callbackStatus: data.status,
                });
                break;

            case CALLBACK_STATUS.FAILED:
            default:
                // Thẻ sai - thất bại
                newStatus = TransactionStatus.FAILED;
                updateTransactionStatus(transaction.id, newStatus);
                logger.info(`[TheSieuToc Callback] THẤT BẠI: ${data.content}`);
                break;
        }

        // Xóa khỏi pending check queue
        removePendingCheck(data.content).catch((err) => {
            logger.error('[TheSieuToc Callback] Lỗi khi xóa pending check:', err);
        });

        // Log to card.log file (tất cả giao dịch)
        cardLogger.info(
            `User: ${transaction.name} | Status: ${data.status} | ` +
                `Type: ${data.card_type} | Amount: ${data.amount} | ` +
                `Real: ${data.real_amount} | Content: ${data.content}`
        );

        res.json({
            success: true,
            message: 'Xử lý callback thành công',
            data: {
                transaction_id: data.content,
                callback_status: data.status,
                new_status: newStatus,
                amount: data.amount,
                real_amount: data.real_amount,
                receive_amount: data.receive_amount,
                noidung: data.noidung,
            },
        });
    } catch (error) {
        logger.error('[TheSieuToc Callback] Lỗi xử lý:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xử lý callback',
            error: error instanceof Error ? error.message : 'Lỗi không xác định',
        });
    }
}

// Legacy export for backward compatibility
export const callbackHandler = theSieuTocCallbackHandler;

// ============================================================
// PayOS Payment Webhook Handler
// ============================================================

/**
 * PayOS Payment Webhook Handler
 * POST /api/payos/callback
 * POST /api/payos/webhook
 *
 * Nhận webhook từ PayOS khi thanh toán được xử lý
 * PayOS yêu cầu response status 2XX để xác nhận webhook thành công
 *
 * Webhook fields:
 * - code: "00" = success
 * - desc: Mô tả kết quả
 * - success: boolean
 * - signature: Chữ ký HMAC SHA256
 * - data: { orderCode, amount, reference, transactionDateTime, ... }
 */
export async function payOSWebhookHandler(req: Request, res: Response): Promise<void> {
    try {
        const webhookBody = req.body as PayOSWebhookPayload;

        logger.info('[PayOS Webhook] Received:', {
            code: webhookBody.code,
            success: webhookBody.success,
            orderCode: webhookBody.data?.orderCode,
        });

        // 1. Verify signature
        // 1. Verify signature
        const verifiedData = await payOSService.verifyWebhookAsync(webhookBody);

        // 2. Process webhook result
        const result = payOSService.processWebhookResult(webhookBody);

        // 3. Update database
        payOSService.updatePaymentStatus(
            result.orderCode,
            result.status,
            verifiedData as unknown as PayOSPaymentData
        );

        // 4. Log webhook and successful payment
        logPayOSWebhook('PAYMENT', {
            orderCode: result.orderCode,
            code: webhookBody.code,
            desc: webhookBody.desc,
            success: webhookBody.success,
            amount: verifiedData.amount,
        });

        if (result.status === 'SUCCESS') {
            logSuccessPayment({
                orderCode: result.orderCode,
                amount: verifiedData.amount,
                description: verifiedData.description,
                reference: verifiedData.reference,
                transactionDateTime: verifiedData.transactionDateTime,
                status: result.status,
            });

            logger.info('[PayOS Webhook] Thanh toán thành công:', {
                orderCode: result.orderCode,
                amount: verifiedData.amount,
                reference: verifiedData.reference,
                transactionDateTime: verifiedData.transactionDateTime,
            });
        }

        // 5. Return success response (PayOS expects 2XX)
        res.status(200).json({
            success: true,
            code: 'SUCCESS',
            message: 'Webhook processed successfully',
            data: {
                orderCode: result.orderCode,
                status: result.status,
                signatureVerified: true, // Xác nhận signature đã được SDK verify
            },
        });
    } catch (error) {
        logger.error('[PayOS Webhook] Processing error:', error);

        if (error instanceof PayOSSignatureError) {
            // Signature invalid - reject webhook
            res.status(400).json({
                success: false,
                code: error.code,
                message: error.message,
            });
            return;
        }

        // Other errors - still acknowledge webhook to prevent retries
        // but log for investigation
        res.status(200).json({
            success: false,
            code: 'PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Lỗi xử lý webhook',
        });
    }
}
