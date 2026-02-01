import { Router } from 'express';
import { payOSController } from './payos.controller.js';
import { asyncHandler } from '../../common/middleware/index.js';
import { strictRateLimiter } from '../../common/middleware/rate-limit.js';

const router = Router();

// ============================================================
// Payment Link Endpoints
// ============================================================

/**
 * POST /api/payos/create-payment-link
 * Tạo link thanh toán mới
 *
 * Body: {
 *   orderCode: number,      // Mã đơn hàng (unique)
 *   amount: number,         // Số tiền (VND, min 1000)
 *   description: string,    // Mô tả (max 25 ký tự)
 *   returnUrl: string,      // URL redirect khi thanh toán thành công
 *   cancelUrl: string       // URL redirect khi hủy thanh toán
 * }
 */
router.post(
    '/checkout',
    strictRateLimiter,
    asyncHandler((req, res) => payOSController.createPaymentLink(req, res))
);

/**
 * GET /api/payos/payment-info/:orderCode
 * Lấy thông tin link thanh toán từ PayOS API
 */
router.get(
    '/payment-info/:orderCode',
    asyncHandler((req, res) => payOSController.getPaymentInfo(req, res))
);

/**
 * GET /api/payos/orders/:orderCode
 * Lấy thông tin đơn hàng từ database local
 */
router.get(
    '/orders/:orderCode',
    asyncHandler((req, res) => payOSController.getOrderFromDB(req, res))
);

// ============================================================
// Webhook Endpoints
// ============================================================

/**
 * POST /api/payos/callback
 * Webhook callback từ PayOS (payment-requests)
 *
 * PayOS sẽ gọi endpoint này khi có thanh toán
 * Response 2XX để xác nhận đã nhận webhook thành công
 *
 * Body: {
 *   code: string,           // '00' = success
 *   desc: string,           // Mô tả
 *   success: boolean,
 *   signature: string,      // HMAC SHA256 signature
 *   data: {
 *     orderCode: number,
 *     amount: number,
 *     description: string,
 *     reference: string,
 *     transactionDateTime: string,
 *     ...
 *   }
 * }
 */
router.post(
    '/callback',
    asyncHandler((req, res) => payOSController.handleWebhook(req, res))
);

export default router;


