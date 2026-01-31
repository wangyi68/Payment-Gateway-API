import { db, TransactionStatus, type Transaction } from '../../database/index.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Create a new transaction record
 */
export function createTransaction(data: {
    name: string;
    trans_id: string;
    amount: number;
    pin: string;
    seri: string;
    type: string;
}): number {
    const stmt = db.prepare(`
    INSERT INTO trans_log (name, trans_id, amount, pin, seri, type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const result = stmt.run(
        data.name,
        data.trans_id,
        data.amount,
        data.pin,
        data.seri,
        data.type,
        TransactionStatus.PENDING
    );

    logger.info(`Đã tạo giao dịch: ${data.trans_id} cho user: ${data.name}`);
    return result.lastInsertRowid as number;
}

/**
 * Find a pending transaction by callback data
 */
export function findPendingTransaction(
    transId: string,
    pin: string,
    serial: string,
    cardType: string
): Transaction | undefined {
    const stmt = db.prepare(`
    SELECT * FROM trans_log 
    WHERE status = ? AND trans_id = ? AND pin = ? AND seri = ? AND type = ?
  `);

    return stmt.get(TransactionStatus.PENDING, transId, pin, serial, cardType) as
        | Transaction
        | undefined;
}

/**
 * Update transaction status by ID
 */
export function updateTransactionStatus(
    id: number,
    status: TransactionStatus,
    amount?: number
): void;
/**
 * Update transaction status by trans_id
 */
export function updateTransactionStatus(
    transId: string,
    status: TransactionStatus,
    amount?: number
): void;
export function updateTransactionStatus(
    idOrTransId: number | string,
    status: TransactionStatus,
    amount?: number
): void {
    const isById = typeof idOrTransId === 'number';

    if (amount !== undefined) {
        const stmt = db.prepare(
            isById
                ? `UPDATE trans_log SET status = ?, amount = ? WHERE id = ?`
                : `UPDATE trans_log SET status = ?, amount = ? WHERE trans_id = ?`
        );
        stmt.run(status, amount, idOrTransId);
    } else {
        const stmt = db.prepare(
            isById
                ? `UPDATE trans_log SET status = ? WHERE id = ?`
                : `UPDATE trans_log SET status = ? WHERE trans_id = ?`
        );
        stmt.run(status, idOrTransId);
    }

    logger.info(`Đã cập nhật giao dịch ${idOrTransId} sang trạng thái ${status}`);
}

/**
 * Get transaction history (latest 10)
 */
export function getTransactionHistory(limit: number = 10): Transaction[] {
    const stmt = db.prepare(`
    SELECT * FROM trans_log ORDER BY id DESC LIMIT ?
  `);

    return stmt.all(limit) as Transaction[];
}

/**
 * Get transaction by ID
 */
export function getTransactionById(id: number): Transaction | undefined {
    const stmt = db.prepare('SELECT * FROM trans_log WHERE id = ?');
    return stmt.get(id) as Transaction | undefined;
}

/**
 * Get transaction by trans_id
 */
export function getTransactionByTransId(transId: string): Transaction | undefined {
    const stmt = db.prepare('SELECT * FROM trans_log WHERE trans_id = ?');
    return stmt.get(transId) as Transaction | undefined;
}

/**
 * Search transactions
 */
export function searchTransactions(criteria: {
    trans_id?: string;
    code?: string; // trans_id or request_id
    serial?: string;
    pin?: string;
    status?: number;
    limit?: number;
    offset?: number;
}): Transaction[] {
    let query = 'SELECT * FROM trans_log WHERE 1=1';
    const params: (string | number)[] = [];

    if (criteria.trans_id) {
        query += ' AND trans_id = ?';
        params.push(criteria.trans_id);
    }

    // Fuzzy search for code (trans_id alias)
    if (criteria.code) {
        query += ' AND trans_id LIKE ?';
        params.push(`%${criteria.code}%`);
    }

    if (criteria.serial) {
        query += ' AND seri = ?';
        params.push(criteria.serial);
    }

    if (criteria.pin) {
        query += ' AND pin = ?';
        params.push(criteria.pin);
    }

    if (criteria.status !== undefined) {
        query += ' AND status = ?';
        params.push(criteria.status);
    }

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(criteria.limit || 20);
    params.push(criteria.offset || 0);

    const stmt = db.prepare(query);
    return stmt.all(...params) as Transaction[];
}

/**
 * Get status text for display
 */
export function getStatusText(status: TransactionStatus): string {
    switch (status) {
        case TransactionStatus.SUCCESS:
            return 'Thành Công';
        case TransactionStatus.FAILED:
            return 'Thất Bại';
        case TransactionStatus.WRONG_AMOUNT:
            return 'Sai Mệnh Giá';
        case TransactionStatus.PENDING:
        default:
            return 'Chờ Duyệt';
    }
}
