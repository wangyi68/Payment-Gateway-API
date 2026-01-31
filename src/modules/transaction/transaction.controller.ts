import { Request, Response } from 'express';
import {
    getTransactionHistory,
    getTransactionById,
    searchTransactions,
    getStatusText,
} from './transaction.service.js';
import { type ApiResponse, type TransactionHistory } from '../../common/types/index.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Lấy lịch sử giao dịch
 * GET /api/transaction/history?limit=10
 */
export function getHistoryHandler(
    req: Request,
    res: Response<ApiResponse<TransactionHistory[]>>
): void {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
        const transactions = getTransactionHistory(limit);

        const history: TransactionHistory[] = transactions.map((tx) => ({
            id: tx.id,
            name: tx.name,
            amount: tx.amount,
            seri: tx.seri,
            type: tx.type,
            status: tx.status,
            statusText: getStatusText(tx.status),
            trans_id: tx.trans_id,
            date: tx.date,
        }));

        res.json({
            success: true,
            message: `Lịch sử giao dịch (${history.length})`,
            data: history,
        });
    } catch (error) {
        logger.error('[History] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ nội bộ',
        });
    }
}

/**
 * Tìm kiếm giao dịch
 * GET /api/transaction/search
 */
export function searchTransactionHandler(
    req: Request,
    res: Response<ApiResponse<TransactionHistory[]>>
): void {
    try {
        const { serial, pin, trans_id, request_id, status } = req.query;

        // Use either trans_id or request_id for the code search
        const code = (trans_id as string) || (request_id as string);

        const transactions = searchTransactions({
            serial: serial as string,
            pin: pin as string,
            code: code,
            status: status ? parseInt(status as string) : undefined,
            limit: 20,
        });

        const history: TransactionHistory[] = transactions.map((tx) => ({
            id: tx.id,
            name: tx.name,
            amount: tx.amount,
            seri: tx.seri,
            type: tx.type,
            status: tx.status,
            statusText: getStatusText(tx.status),
            trans_id: tx.trans_id,
            date: tx.date,
        }));

        res.json({
            success: true,
            message: `Tìm thấy ${history.length} giao dịch`,
            data: history,
        });
    } catch (error) {
        logger.error('[Search] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ nội bộ',
        });
    }
}

/**
 * Xem chi tiết log giao dịch
 * GET /api/transaction/:id/logs
 */
export function getTransactionLogsHandler(req: Request, res: Response<ApiResponse>): void {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({
                success: false,
                message: 'ID giao dịch không hợp lệ',
            });
            return;
        }

        const tx = getTransactionById(id);

        if (!tx) {
            res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch',
            });
            return;
        }

        res.json({
            success: true,
            message: 'Chi tiết giao dịch',
            data: {
                transaction: {
                    ...tx,
                    statusText: getStatusText(tx.status),
                },
                logs: [
                    {
                        time: tx.date,
                        event: 'CREATED',
                        message: `Giao dịch được tạo. Serial: ${tx.seri}, Amount: ${tx.amount}`,
                    },
                    {
                        time: tx.date,
                        event: 'STATUS_CHANGE',
                        message: `Trạng thái hiện tại: ${getStatusText(tx.status)}`,
                    },
                ],
            },
        });
    } catch (error) {
        logger.error('[Transaction Logs] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ nội bộ',
        });
    }
}
