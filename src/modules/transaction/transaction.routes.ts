import { Router } from 'express';
import {
    getHistoryHandler,
    searchTransactionHandler,
    getTransactionLogsHandler,
} from './transaction.controller.js';

const router = Router();

// GET /api/transaction/history - Lịch sử giao dịch
router.get('/history', getHistoryHandler);

// GET /api/transaction/search - Tìm kiếm giao dịch
router.get('/search', searchTransactionHandler);

// GET /api/transaction/:id/logs - Chi tiết log giao dịch
router.get('/:id/logs', getTransactionLogsHandler);

export default router;
