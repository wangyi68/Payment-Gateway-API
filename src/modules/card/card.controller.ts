import { Request, Response } from 'express';
import {
    submitCard,
    generateTransactionId,
    isSuccessResponse,
    getCardDiscounts,
    checkCardStatus,
} from './thesieutoc.service.js';
import {
    createTransaction,
    getTransactionByTransId,
    getStatusText,
} from '../transaction/transaction.service.js';
import { validateCard, addToBlacklist } from './validation.service.js';
import { addPendingCheck } from '../../jobs/queue.service.js';
import {
    SubmitCardRequest,
    CheckStatusRequest,
    type ApiResponse,
} from '../../common/types/index.js';
import { logger } from '../../common/utils/logger.js';
import { config } from '../../config/index.js';

/**
 * 1.1 Gửi thẻ cào lên hệ thống
 * POST /api/card
 */
export async function submitCardHandler(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
        const parseResult = SubmitCardRequest.safeParse(req.body);

        if (!parseResult.success) {
            res.status(400).json({
                success: false,
                message: 'Vui lòng nhập đầy đủ thông tin!',
                error: parseResult.error.errors.map((e) => `${e.path}: ${e.message}`).join(', '),
            });
            return;
        }

        const data = parseResult.data;

        // Validate card format, blacklist, and duplicates
        const validation = validateCard(
            data.card_type,
            data.serial,
            data.pin,
            config.validation.duplicateCheckHours
        );

        if (!validation.valid) {
            res.status(400).json({
                success: false,
                message: 'Thẻ không hợp lệ',
                error: validation.errors.join('; '),
            });
            return;
        }

        // Warn about duplicates but still allow submission
        if (validation.warnings.length > 0) {
            logger.warn(
                `[Submit] Warnings for ${data.username}: ${validation.warnings.join('; ')}`
            );
        }

        const transactionId = generateTransactionId();

        logger.info(
            `[Submit] User: ${data.username}, Type: ${data.card_type}, Amount: ${data.card_amount}`
        );

        const response = await submitCard(data, transactionId);

        if (isSuccessResponse(response)) {
            // Save to local database
            createTransaction({
                name: data.username,
                trans_id: transactionId,
                amount: parseInt(data.card_amount),
                pin: data.pin,
                seri: data.serial,
                type: data.card_type,
            });

            // Add to pending check queue
            await addPendingCheck(transactionId);

            // Add to blacklist (to prevent duplicate submissions)
            addToBlacklist(data.serial, data.pin, data.card_type, 'submitted');

            res.json({
                success: true,
                message: response.msg || 'Thẻ đã được gửi lên hệ thống',
                code: response.status,
                data: {
                    transaction_id: transactionId,
                    amount: response.amount,
                    warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
                },
            });
        } else {
            const errorMessages: Record<string, string> = {
                '-1': 'Mệnh giá không hợp lệ',
                '-2': 'Mã thẻ hoặc số serial không đúng',
                '1': 'Lỗi nhà mạng',
                '2': 'Sai mệnh giá',
                '3': 'Thẻ đã được sử dụng',
                '4': 'Thẻ bị khóa',
                '100': 'Lỗi hệ thống',
                unknown: 'Lỗi không xác định từ TheSieuToc',
            };
            const errorMsg =
                response.msg || errorMessages[response.status] || errorMessages.unknown;

            res.status(400).json({
                success: false,
                message: errorMsg,
                code: response.status,
                error: response.status,
            });
        }
    } catch (error) {
        logger.error('[Submit] Server error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ nội bộ',
        });
    }
}

/**
 * 1.0 Lấy chiết khấu thẻ cào
 * GET /api/card/discount/:account?
 */
export async function getDiscountHandler(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
        const account = req.params.account;
        const discounts = await getCardDiscounts(account);

        res.json({
            success: true,
            message: account ? `Chiết khấu cho tài khoản ${account}` : 'Bảng chiết khấu mặc định',
            data: discounts,
        });
    } catch (error) {
        logger.error('[Discount] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ nội bộ',
        });
    }
}

/**
 * 1.3 Kiểm tra trạng thái thẻ cào
 * POST /api/card/status
 *
 * Status codes:
 * - "00": Thẻ thành công
 * - "99": Thẻ sai mệnh giá
 * - "-10": Thẻ sai
 * - "-9": Thẻ chờ duyệt
 * - "2": Lỗi không kiểm tra được
 */
export async function checkStatusHandler(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
        const parseResult = CheckStatusRequest.safeParse(req.body);

        if (!parseResult.success) {
            res.status(400).json({
                success: false,
                message: 'Mã giao dịch (transaction_id) là bắt buộc',
                error: parseResult.error.errors.map((e) => e.message).join(', '),
            });
            return;
        }

        const { transaction_id } = parseResult.data;

        // Check local database
        const localTx = getTransactionByTransId(transaction_id);

        // Check with TheSieuToc API
        const apiStatus = await checkCardStatus(transaction_id);

        // Translate API status message
        const statusMessages: Record<string, string> = {
            '00': 'Thẻ thành công',
            '99': 'Thẻ sai mệnh giá',
            '-10': 'Thẻ sai',
            '-9': 'Thẻ chờ duyệt',
            '2': 'Lỗi không kiểm tra được',
            unknown: 'Trạng thái không xác định',
        };
        const statusMessage =
            apiStatus.msg || statusMessages[apiStatus.status] || statusMessages.unknown;

        res.json({
            success: true,
            message: statusMessage,
            code: apiStatus.status,
            data: {
                transaction_id,
                // API response
                api_status: apiStatus.status,
                api_status_text: statusMessage,
                api_amount: apiStatus.amount,
                api_msg: apiStatus.msg,
                // Local database
                local: localTx
                    ? {
                          id: localTx.id,
                          name: localTx.name,
                          amount: localTx.amount,
                          type: localTx.type,
                          status: localTx.status,
                          status_text: getStatusText(localTx.status),
                          date: localTx.date,
                      }
                    : null,
            },
        });
    } catch (error) {
        logger.error('[Check Status] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ nội bộ',
        });
    }
}
