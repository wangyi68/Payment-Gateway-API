import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';
import type {
    TheSieuTocSubmitResponse,
    SubmitCardRequest,
    CardDiscount,
    CardStatusResponse,
} from '../../common/types/index.js';
import { SUBMIT_STATUS } from '../../common/types/index.js';

const api = axios.create({
    baseURL: config.thesieutoc.baseUrl,
    timeout: 30000,
});

/**
 * Generate unique transaction ID (content)
 * Used as reference code for transaction matching
 */
export function generateTransactionId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString() + crypto.randomBytes(8).toString('hex');
    return crypto
        .createHash('md5')
        .update(timestamp + random)
        .digest('hex');
}

/**
 * 1.1 Submit Card - POST/GET /chargingws/v2
 *
 * Params:
 * - APIkey: API key from website
 * - mathe: Card PIN
 * - seri: Card Serial
 * - type: Card type (Viettel, Mobifone, etc.)
 * - menhgia: Card amount
 * - content: Reference ID (transaction_id)
 */
export async function submitCard(
    data: SubmitCardRequest,
    transactionId: string
): Promise<TheSieuTocSubmitResponse> {
    try {
        const payload = {
            APIkey: config.thesieutoc.apiKey,
            mathe: data.pin,
            seri: data.serial,
            type: data.card_type,
            menhgia: data.card_amount,
            content: transactionId,
        };

        // Switch to POST for better security (avoiding sensitive data in URL/web server logs)
        const response = await api.post<TheSieuTocSubmitResponse>(
            '/chargingws/v2',
            new URLSearchParams(payload),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        logger.info(
            `[Submit Card] ${data.card_type} ${data.card_amount} -> Status: ${response.data.status}`
        );
        return response.data;
    } catch (error) {
        logger.error(`[Submit Card] Lỗi: ${error}`);
        throw error;
    }
}

/**
 * 1.0 Get Card Discounts - GET /topup/discount/{account?}
 *
 * - Without account: Get default discounts
 * - With account: Get account-specific discounts
 */
export async function getCardDiscounts(account?: string): Promise<CardDiscount[]> {
    try {
        const url = account ? `/topup/discount/${encodeURIComponent(account)}` : '/topup/discount';

        const response = await api.get<CardDiscount[]>(url);
        logger.info(
            `[Get Discount] Account: ${account || 'default'}, Cards: ${response.data.length}`
        );
        return response.data;
    } catch (error) {
        logger.error(`[Get Discount] Lỗi: ${error}`);
        throw error;
    }
}

/**
 * 1.3 Check Card Status - POST/GET /chargingws/status_card
 *
 * Params:
 * - APIkey: API key
 * - content: Reference ID (transaction_id from submit)
 *
 * Response status:
 * - "00": Success
 * - "99": Wrong amount
 * - "-10": Card failed
 * - "-9": Pending
 * - "2": Error checking
 */
export async function checkCardStatus(transactionId: string): Promise<CardStatusResponse> {
    try {
        const response = await api.post<CardStatusResponse>(
            '/chargingws/status_card',
            new URLSearchParams({
                APIkey: config.thesieutoc.apiKey,
                content: transactionId,
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        logger.info(`[Check Status] ${transactionId} -> Status: ${response.data.status}`);
        return response.data;
    } catch (error) {
        logger.error(`[Check Status] Lỗi: ${error}`);
        throw error;
    }
}

/**
 * Check if submit response indicates success
 */
export function isSuccessResponse(response: TheSieuTocSubmitResponse): boolean {
    return response.status === SUBMIT_STATUS.SUCCESS;
}

/**
 * Get human-readable error message from status code
 */
export function getSubmitErrorMessage(status: string): string {
    const messages: Record<string, string> = {
        [SUBMIT_STATUS.NO_API_KEY]: 'Chưa nhập API key',
        [SUBMIT_STATUS.INVALID_API]: 'Sai thông tin API',
        [SUBMIT_STATUS.ACCOUNT_LOCKED]: 'Tài khoản đã bị khóa',
        [SUBMIT_STATUS.MAINTENANCE]: 'Thẻ đang bảo trì',
        [SUBMIT_STATUS.CARD_USED]: 'Thẻ đã được sử dụng trên hệ thống',
        [SUBMIT_STATUS.NO_SERIAL]: 'Chưa nhập số Seri',
        [SUBMIT_STATUS.NO_PIN]: 'Chưa nhập mã thẻ',
        [SUBMIT_STATUS.NO_AMOUNT]: 'Chưa chọn mệnh giá',
        [SUBMIT_STATUS.UNKNOWN_ERROR]: 'Lỗi không xác định',
    };
    return messages[status] || `Lỗi: ${status}`;
}

/**
 * Get human-readable status message from check status code
 */
export function getCheckStatusMessage(status: string): string {
    const messages: Record<string, string> = {
        '00': 'Thẻ thành công',
        '99': 'Thẻ sai mệnh giá',
        '-10': 'Thẻ sai',
        '-9': 'Thẻ đang chờ duyệt',
        '2': 'Lỗi không kiểm tra được',
    };
    return messages[status] || `Trạng thái: ${status}`;
}


