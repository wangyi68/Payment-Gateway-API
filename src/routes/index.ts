import { Router } from 'express';
import {
    submitCardHandler,
    getDiscountHandler,
    checkStatusHandler,
    getHistoryHandler,
    searchTransactionHandler,
    getTransactionLogsHandler,
} from '../controllers/card.controller.js';
import { callbackHandler } from '../controllers/callback.controller.js';
import { getSystemInfoHandler } from '../controllers/system.controller.js';

const router = Router();

// System routes
router.get('/system/info', getSystemInfoHandler);

// Card routes
router.post('/card', submitCardHandler);
router.get('/card/discount/:account?', getDiscountHandler);
router.post('/card/status', checkStatusHandler);

// Transaction routes
router.get('/transaction/search', searchTransactionHandler);
router.get('/transaction/:id/logs', getTransactionLogsHandler);

// History route (Legacy)
router.get('/history', getHistoryHandler);

// Callback route (from TheSieuToc)
router.post('/callback', callbackHandler);

export default router;
