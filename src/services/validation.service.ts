/**
 * Validation Service
 * - Kiểm tra định dạng serial/pin theo từng nhà mạng
 * - Quản lý blacklist
 * - Phát hiện thẻ trùng lặp
 */

import { db } from '../database/index.js';
import { logger } from '../utils/logger.js';
import type { CardType } from '../types/index.js';


// ============================================================
// Mẫu validation theo từng nhà mạng
// ============================================================

interface TelcoPattern {
    name: string;
    serial: {
        pattern: RegExp;
        length: number[];
        description: string;
    };
    pin: {
        pattern: RegExp;
        length: number[];
        description: string;
    };
}

export const TELCO_PATTERNS: Record<string, TelcoPattern> = {
    Viettel: {
        name: 'Viettel',
        serial: {
            pattern: /^[0-9]{11,15}$/,
            length: [11, 12, 13, 14, 15],
            description: 'Serial Viettel phải từ 11-15 chữ số',
        },
        pin: {
            pattern: /^[0-9]{12,15}$/,
            length: [12, 13, 14, 15],
            description: 'Mã thẻ Viettel phải từ 12-15 chữ số',
        },
    },
    Mobifone: {
        name: 'Mobifone',
        serial: {
            pattern: /^[0-9]{12,15}$/,
            length: [12, 13, 14, 15],
            description: 'Serial Mobifone phải từ 12-15 chữ số',
        },
        pin: {
            pattern: /^[0-9]{12,14}$/,
            length: [12, 13, 14],
            description: 'Mã thẻ Mobifone phải từ 12-14 chữ số',
        },
    },
    Vinaphone: {
        name: 'Vinaphone',
        serial: {
            pattern: /^[0-9]{12,14}$/,
            length: [12, 13, 14],
            description: 'Serial Vinaphone phải từ 12-14 chữ số',
        },
        pin: {
            pattern: /^[0-9]{12,14}$/,
            length: [12, 13, 14],
            description: 'Mã thẻ Vinaphone phải từ 12-14 chữ số',
        },
    },
    Vietnamobile: {
        name: 'Vietnamobile',
        serial: {
            pattern: /^[0-9]{12,15}$/,
            length: [12, 13, 14, 15],
            description: 'Serial Vietnamobile phải từ 12-15 chữ số',
        },
        pin: {
            pattern: /^[0-9]{12,15}$/,
            length: [12, 13, 14, 15],
            description: 'Mã thẻ Vietnamobile phải từ 12-15 chữ số',
        },
    },
    Zing: {
        name: 'Zing',
        serial: {
            pattern: /^[0-9]{9,12}$/,
            length: [9, 10, 11, 12],
            description: 'Serial Zing phải từ 9-12 chữ số',
        },
        pin: {
            pattern: /^[0-9]{9,12}$/,
            length: [9, 10, 11, 12],
            description: 'Mã thẻ Zing phải từ 9-12 chữ số',
        },
    },
    Gate: {
        name: 'Gate',
        serial: {
            pattern: /^[0-9]{10,15}$/,
            length: [10, 11, 12, 13, 14, 15],
            description: 'Serial Gate phải từ 10-15 chữ số',
        },
        pin: {
            pattern: /^[0-9]{10,15}$/,
            length: [10, 11, 12, 13, 14, 15],
            description: 'Mã thẻ Gate phải từ 10-15 chữ số',
        },
    },
    Garena: {
        name: 'Garena',
        serial: {
            pattern: /^[A-Za-z0-9]{10,20}$/,
            length: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            description: 'Serial Garena phải từ 10-20 ký tự (chữ và số)',
        },
        pin: {
            pattern: /^[A-Za-z0-9]{10,20}$/,
            length: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            description: 'Mã thẻ Garena phải từ 10-20 ký tự (chữ và số)',
        },
    },
    Vcoin: {
        name: 'Vcoin',
        serial: {
            pattern: /^[0-9]{10,15}$/,
            length: [10, 11, 12, 13, 14, 15],
            description: 'Serial Vcoin phải từ 10-15 chữ số',
        },
        pin: {
            pattern: /^[0-9]{10,15}$/,
            length: [10, 11, 12, 13, 14, 15],
            description: 'Mã thẻ Vcoin phải từ 10-15 chữ số',
        },
    },
};

// ============================================================
// Kết quả Validation
// ============================================================

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

// ============================================================
// Kiểm tra định dạng serial và pin theo nhà mạng
// ============================================================

export function validateCardFormat(
    cardType: CardType,
    serial: string,
    pin: string
): ValidationResult {
    const errors: string[] = [];
    const telcoPattern = TELCO_PATTERNS[cardType];

    if (!telcoPattern) {
        return {
            valid: false,
            errors: [`Loại thẻ không hợp lệ: ${cardType}`],
        };
    }

    // Kiểm tra serial
    if (!telcoPattern.serial.pattern.test(serial)) {
        errors.push(telcoPattern.serial.description);
    }

    // Kiểm tra pin
    if (!telcoPattern.pin.pattern.test(pin)) {
        errors.push(telcoPattern.pin.description);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============================================================
// Quản lý Blacklist (Database)
// ============================================================

export interface BlacklistEntry {
    id: number;
    serial: string;
    pin: string;
    card_type: string;
    reason: string;
    created_at: string;
}

/**
 * Khởi tạo bảng blacklist
 */
export function initBlacklistTable(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS card_blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serial TEXT NOT NULL,
            pin TEXT NOT NULL,
            card_type TEXT NOT NULL,
            reason TEXT DEFAULT 'used',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            UNIQUE(serial, pin)
        );
        CREATE INDEX IF NOT EXISTS idx_blacklist_serial ON card_blacklist(serial);
        CREATE INDEX IF NOT EXISTS idx_blacklist_pin ON card_blacklist(pin);
    `);
    logger.info('[Validation] Đã khởi tạo bảng blacklist');
}

/**
 * Thêm thẻ vào blacklist
 */
export function addToBlacklist(
    serial: string,
    pin: string,
    cardType: string,
    reason: string = 'used'
): boolean {
    try {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO card_blacklist (serial, pin, card_type, reason)
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(serial, pin, cardType, reason);
        if (result.changes > 0) {
            logger.info(`[Blacklist] Đã thêm: ${cardType} - ${serial.slice(0, 4)}****`);
        }
        return result.changes > 0;
    } catch (error) {
        logger.error(`[Blacklist] Lỗi khi thêm thẻ: ${error}`);
        return false;
    }
}

/**
 * Kiểm tra thẻ có trong blacklist không
 */
export function isBlacklisted(serial: string, pin: string): boolean {
    const stmt = db.prepare(`
        SELECT id FROM card_blacklist WHERE serial = ? AND pin = ?
    `);
    const result = stmt.get(serial, pin);
    return !!result;
}

/**
 * Lấy thông tin blacklist
 */
export function getBlacklistEntry(serial: string, pin: string): BlacklistEntry | null {
    const stmt = db.prepare(`
        SELECT * FROM card_blacklist WHERE serial = ? AND pin = ?
    `);
    return stmt.get(serial, pin) as BlacklistEntry | null;
}

/**
 * Xóa khỏi blacklist
 */
export function removeFromBlacklist(serial: string, pin: string): boolean {
    const stmt = db.prepare(`
        DELETE FROM card_blacklist WHERE serial = ? AND pin = ?
    `);
    const result = stmt.run(serial, pin);
    return result.changes > 0;
}

// ============================================================
// Phát hiện thẻ trùng lặp
// ============================================================

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingTransaction?: {
        trans_id: string;
        date: string;
        status: number;
    };
}

/**
 * Kiểm tra thẻ đã được gửi trước đó chưa
 * Kiểm tra trong khoảng thời gian chỉ định (giờ)
 */
export function checkDuplicate(
    serial: string,
    pin: string,
    withinHours: number = 24
): DuplicateCheckResult {
    const stmt = db.prepare(`
        SELECT trans_id, date, status
        FROM trans_log
        WHERE seri = ? AND pin = ?
        AND datetime(date) > datetime('now', '-' || ? || ' hours', 'localtime')
        ORDER BY date DESC
        LIMIT 1
    `);

    const existing = stmt.get(serial, pin, withinHours) as {
        trans_id: string;
        date: string;
        status: number;
    } | undefined;

    if (existing) {
        logger.warn(`[Duplicate] Thẻ ${serial.slice(0, 4)}**** đã được gửi trong ${withinHours}h gần đây`);
        return {
            isDuplicate: true,
            existingTransaction: existing,
        };
    }

    return { isDuplicate: false };
}

// ============================================================
// Validation đầy đủ
// ============================================================

export interface FullValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    duplicateInfo?: DuplicateCheckResult['existingTransaction'];
}

/**
 * Thực hiện validation đầy đủ:
 * 1. Kiểm tra định dạng (regex)
 * 2. Kiểm tra blacklist
 * 3. Kiểm tra trùng lặp
 */
export function validateCard(
    cardType: CardType,
    serial: string,
    pin: string,
    checkDuplicateHours: number = 24
): FullValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let duplicateInfo: DuplicateCheckResult['existingTransaction'];

    // 1. Kiểm tra định dạng
    const formatResult = validateCardFormat(cardType, serial, pin);
    if (!formatResult.valid) {
        errors.push(...formatResult.errors);
    }

    // 2. Kiểm tra blacklist
    if (isBlacklisted(serial, pin)) {
        const entry = getBlacklistEntry(serial, pin);
        errors.push(`Thẻ đã bị chặn: ${entry?.reason || 'đã sử dụng'}`);
    }

    // 3. Kiểm tra trùng lặp
    const duplicateResult = checkDuplicate(serial, pin, checkDuplicateHours);
    if (duplicateResult.isDuplicate) {
        duplicateInfo = duplicateResult.existingTransaction;
        warnings.push(
            `Thẻ này đã được gửi trước đó vào ${duplicateInfo?.date}, ` +
            `mã giao dịch: ${duplicateInfo?.trans_id}`
        );
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        duplicateInfo,
    };
}

// ============================================================
// Thống kê
// ============================================================

export function getBlacklistStats(): {
    total: number;
    byType: Record<string, number>;
} {
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM card_blacklist');
    const byTypeStmt = db.prepare(`
        SELECT card_type, COUNT(*) as count
        FROM card_blacklist
        GROUP BY card_type
    `);

    const total = (totalStmt.get() as { count: number }).count;
    const byTypeRows = byTypeStmt.all() as { card_type: string; count: number }[];

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
        byType[row.card_type] = row.count;
    }

    return { total, byType };
}
