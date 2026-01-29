import { Request, Response } from 'express';
import {
    CallbackData,
    type ApiResponse,
    CALLBACK_STATUS,
} from '../types/index.js';
import {
    findPendingTransaction,
    updateTransactionStatus
} from '../services/transaction.service.js';
import { TransactionStatus } from '../database/index.js';
import { logger, cardLogger, logSuccessCard } from '../utils/logger.js';
import { removePendingCheck } from '../services/queue.service.js';

/**
 * 1.2 Callback Handler
 * POST /api/callback
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
export function callbackHandler(
    req: Request,
    res: Response<ApiResponse>
): void {
    try {
        logger.info(`[Callback] Nhận callback: ${JSON.stringify(req.body)}`);

        // Validate callback data
        const parseResult = CallbackData.safeParse(req.body);

        if (!parseResult.success) {
            logger.warn('[Callback] Dữ liệu không hợp lệ:', parseResult.error.errors);
            res.status(400).json({
                success: false,
                message: 'Dữ liệu callback không hợp lệ',
                error: parseResult.error.errors.map(e => `${e.path}: ${e.message}`).join(', '),
            });
            return;
        }

        const data = parseResult.data;

        // Find the pending transaction in local database
        const transaction = findPendingTransaction(
            data.content,  // trans_id
            data.pin,
            data.serial,
            data.card_type
        );

        if (!transaction) {
            logger.warn(`[Callback] Không tìm thấy giao dịch: ${data.content}`);
            res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch',
                error: `Không có giao dịch pending với mã: ${data.content}`,
            });
            return;
        }

        // Update transaction status based on callback
        let newStatus: TransactionStatus;
        let actualAmount: number = parseInt(data.amount);

        switch (data.status) {
            case CALLBACK_STATUS.SUCCESS:
                // Thẻ đúng - thành công
                newStatus = TransactionStatus.SUCCESS;
                updateTransactionStatus(transaction.id, newStatus);
                logger.info(`[Callback] THÀNH CÔNG: ${data.content}, Mệnh giá: ${data.amount}đ, Thực nhận: ${data.real_amount}đ`);

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
                logger.info(`[Callback] SAI MỆNH GIÁ: ${data.content}, Khai: ${transaction.amount}đ, Thực: ${actualAmount}đ`);

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
                logger.info(`[Callback] THẤT BẠI: ${data.content}`);
                break;
        }

        // Xóa khỏi pending check queue
        removePendingCheck(data.content).catch(err => {
            logger.error('[Callback] Lỗi khi xóa pending check:', err);
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
        logger.error('[Callback] Lỗi xử lý:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xử lý callback',
            error: error instanceof Error ? error.message : 'Lỗi không xác định',
        });
    }
}

