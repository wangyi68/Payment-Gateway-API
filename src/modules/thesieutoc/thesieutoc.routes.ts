import { Router } from 'express';
import { submitCardHandler, getDiscountHandler, checkStatusHandler } from './thesieutoc.controller.js';
import { callbackHandler } from '../callback/callback.controller.js';
import { strictRateLimiter } from '../../common/middleware/rate-limit.js';
import { apiKeyAuth } from '../../common/middleware/auth.js';

const router = Router();

// POST /api/thesieutoc - Gửi thẻ cào
router.post('/', apiKeyAuth, strictRateLimiter, submitCardHandler);

// GET /api/thesieutoc/discount/:account? - Lấy chiết khấu
router.get('/discount/:account?', getDiscountHandler);

// POST /api/thesieutoc/status - Kiểm tra trạng thái thẻ
router.post('/status', apiKeyAuth, strictRateLimiter, checkStatusHandler);

// POST /api/thesieutoc/callback - Callback từ TheSieuToc
router.post('/callback', callbackHandler);

export default router;


