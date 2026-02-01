import { Request, Response } from 'express';
import { z } from 'zod';
import { payOSService } from './payos.service.js';
import { logger } from '../../common/utils/logger.js';
import { BadRequestError, PayOSError } from '../../common/errors/index.js';
import { payOSWebhookHandler } from '../callback/callback.controller.js';

// ============================================================
// Request Validation Schemas
// ============================================================

const CreatePaymentLinkSchema = z.object({
    orderCode: z.number().int().positive('orderCode phải là số dương').optional(),
    amount: z.number().int().min(1000, 'Số tiền tối thiểu 1,000 VND'),
    description: z.string().min(1).max(25, 'Mô tả tối đa 25 ký tự'),
    returnUrl: z.string().url('returnUrl không hợp lệ'),
    cancelUrl: z.string().url('cancelUrl không hợp lệ'),
    // Optional fields
    buyerName: z.string().optional(),
    buyerEmail: z.string().email().optional(),
    buyerPhone: z.string().optional(),
    buyerAddress: z.string().optional(),
    items: z
        .array(
            z.object({
                name: z.string(),
                quantity: z.number(),
                price: z.number(),
            })
        )
        .optional(),
    expiredAt: z.number().optional(),
});

const GetPaymentInfoSchema = z.object({
    orderCode: z.string().regex(/^\d+$/, 'orderCode phải là số'),
});

// ============================================================
// PayOS Controller
// ============================================================

export class PayOSController {
    /**
     * POST /api/payos/create-payment-link
     * Tạo link thanh toán mới
     */
    async createPaymentLink(req: Request, res: Response) {
        try {
            // Validate request body
            const validationResult = CreatePaymentLinkSchema.safeParse(req.body);

            if (!validationResult.success) {
                const errors = validationResult.error.errors.map((e) => e.message);
                throw new BadRequestError(errors.join(', '), 'VALIDATION_ERROR');
            }

            let { orderCode } = validationResult.data;
            const { amount, description, returnUrl, cancelUrl } = validationResult.data;

            // Tự động sinh orderCode nếu không có (Sử dụng timestamp để đảm bảo duy nhất)
            // Giới hạn PayOS: số nguyên < 9007199254740991
            if (!orderCode) {
                // Generate unique orderCode: timestamp (13 digits) + random (3 digits) -> cắt bớt hoặc dùng timestamp thuần
                // Date.now() = 1709... (13 số). Max Safe Integer = 9007... (16 số).
                // Ta có thể thêm 3 số random vào đuôi.
                // Tuy nhiên để ngắn gọn và dễ đọc, ta dùng Date.now() là đủ unique cho traffic thấp/trung bình.
                // Để chắc chắn hơn, ta dùng: HHmmss + Random(6 số) -> đảm bảo ngắn và unique trong ngày,
                // hoặc dùng timestamp.
                // PayOS yêu cầu: < 9e15. Date.now() ~ 1.7e12.
                // Vậy ta có thể nhân Date.now() * 100 + random(0-99) => 15 chữ số. An toàn.
                orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 100)}`);
            }

            // Đảm bảo orderCode nằm trong giới hạn Safe Integer
            if (orderCode > Number.MAX_SAFE_INTEGER) {
                orderCode = Date.now(); // Fallback về timestamp thuần nếu bị lố
            }

            const result = await payOSService.createPaymentLink(
                orderCode,
                amount,
                description,
                returnUrl,
                cancelUrl
            );

            res.json({
                success: true,
                code: 'SUCCESS',
                message: 'Tạo link thanh toán thành công',
                data: result,
            });
        } catch (error) {
            // Custom errors đã có handler riêng
            if (error instanceof PayOSError || error instanceof BadRequestError) {
                throw error;
            }

            logger.error('[PayOS Controller] Lỗi tạo link thanh toán:', error);
            res.status(500).json({
                success: false,
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Lỗi máy chủ nội bộ',
                data: null,
            });
        }
    }

    /**
     * POST /api/payos/callback (hoặc /api/payos/webhook)
     * Xử lý webhook callback từ PayOS
     * Delegate to callback controller
     */
    async handleWebhook(req: Request, res: Response) {
        return payOSWebhookHandler(req, res);
    }

    /**
     * POST /api/payos/payout-webhook
     * Xử lý webhook payout từ PayOS
     * Delegate to callback controller
     */

    /**
     * GET /api/payos/payment-info/:orderCode
     * Lấy thông tin thanh toán theo orderCode từ PayOS API
     */
    async getPaymentInfo(req: Request, res: Response) {
        try {
            const validationResult = GetPaymentInfoSchema.safeParse(req.params);

            if (!validationResult.success) {
                throw new BadRequestError('orderCode không hợp lệ');
            }

            const { orderCode } = validationResult.data;
            const info = await payOSService.getPaymentLinkInformation(orderCode);

            res.json({
                success: true,
                code: 'SUCCESS',
                message: 'Lấy thông tin thành công',
                data: info,
            });
        } catch (error) {
            if (error instanceof PayOSError || error instanceof BadRequestError) {
                throw error;
            }

            logger.error('[PayOS Controller] Lỗi lấy thông tin thanh toán:', error);
            res.status(500).json({
                success: false,
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Lỗi máy chủ nội bộ',
                data: null,
            });
        }
    }

    /**
     * GET /api/payos/orders/:orderCode
     * Lấy thông tin đơn hàng từ database local
     */
    async getOrderFromDB(req: Request, res: Response) {
        try {
            const orderCode = parseInt(req.params.orderCode);

            if (isNaN(orderCode)) {
                throw new BadRequestError('orderCode không hợp lệ');
            }

            const order = payOSService.getOrderFromDB(orderCode);

            if (!order) {
                res.status(404).json({
                    success: false,
                    code: 'NOT_FOUND',
                    message: 'Không tìm thấy đơn hàng',
                    data: null,
                });
                return;
            }

            res.json({
                success: true,
                code: 'SUCCESS',
                message: 'Lấy thông tin đơn hàng thành công',
                data: order,
            });
        } catch (error) {
            if (error instanceof BadRequestError) {
                throw error;
            }

            logger.error('[PayOS Controller] Lỗi lấy đơn hàng từ DB:', error);
            res.status(500).json({
                success: false,
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Lỗi máy chủ nội bộ',
                data: null,
            });
        }
    }
}

export const payOSController = new PayOSController();


