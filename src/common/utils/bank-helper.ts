import axios from 'axios';
import { logger } from './logger.js';

interface Bank {
    id: number;
    name: string;
    code: string;
    bin: string;
    shortName: string;
    logo: string;
    transferSupported: number;
    lookupSupported: number;
    short_name: string;
    support: number;
    isTransfer: number;
    swift_code: string;
}

interface VietQRBanksResponse {
    code: string;
    desc: string;
    data: Bank[];
}

let bankCache: Map<string, string> = new Map();
let lastFetch: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch list of banks from VietQR API
 */
async function fetchBanks(): Promise<void> {
    const now = Date.now();
    // Nếu đã thử fetch gần đây (trong vòng CACHE_DURATION), không thử lại nữa
    if (now - lastFetch < CACHE_DURATION) {
        return;
    }

    lastFetch = now; // Đánh dấu thời điểm thử fetch

    try {
        logger.info('[BankHelper] Đang tải danh sách ngân hàng từ VietQR...');
        const response = await axios.get<VietQRBanksResponse>('https://api.vietqr.io/v2/banks', {
            timeout: 5000, // Timeout sau 5s để không làm treo hệ thống
        });

        if (response.data.code === '00') {
            const newCache = new Map<string, string>();
            response.data.data.forEach((bank) => {
                newCache.set(bank.bin, bank.shortName);
                if (bank.code) newCache.set(bank.code, bank.shortName);
            });
            bankCache = newCache;
            logger.info(`[BankHelper] Đã tải ${bankCache.size} ngân hàng.`);
        }
    } catch (error) {
        logger.error(
            '[BankHelper] Không thể lấy danh sách ngân hàng (API VietQR lỗi/timeout). Hệ thống sẽ tự động dùng mã BIN gốc.',
            error instanceof Error ? error.message : error
        );
    }
}

/**
 * Get bank short name by BIN or Code
 */
export async function getBankName(bankId: string | null | undefined): Promise<string | null> {
    if (!bankId) return null;

    // Đảm bảo cache đã có dữ liệu
    if (bankCache.size === 0) {
        await fetchBanks();
    }

    return bankCache.get(bankId) || bankId;
}
