import { Router } from 'express';
import { submitCardHandler, getDiscountHandler, checkStatusHandler } from './thesieutoc.controller.js';
import { callbackHandler } from '../callback/callback.controller.js';
import { strictRateLimiter } from '../../common/middleware/rate-limit.js';

const router = Router();

// POST /api/card - Gửi thẻ cào
router.post('/', strictRateLimiter, submitCardHandler);

// GET /api/card/discount/:account? - Lấy chiết khấu
router.get('/discount/:account?', getDiscountHandler);

// POST /api/card/status - Kiểm tra trạng thái thẻ
router.post('/status', strictRateLimiter, checkStatusHandler);

// POST /api/card/callback - Callback từ TheSieuToc
router.post('/callback', callbackHandler);

export default router;


