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
    ip_address?: string;
    user_agent?: string;
}): number {
    const stmt = db.prepare(`
    INSERT INTO trans_log (
        name, trans_id, amount, declared_amount, pin, seri, type, 
        status, ip_address, user_agent
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const result = stmt.run(
        data.name,
        data.trans_id,
        data.amount,
        data.amount, // declared_amount is initially same as amount
        data.pin,
        data.seri,
        data.type,
        TransactionStatus.PENDING,
        data.ip_address || null,
        data.user_agent || null
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
export function updateTransactionStatus(params: {
    idOrTransId: number | string;
    status: TransactionStatus;
    actualAmount?: number;
    netAmount?: number;
    callbackRaw?: string;
    discountRate?: number;
}): void {
    const isById = typeof params.idOrTransId === 'number';
    const whereClause = isById ? 'WHERE id = ?' : 'WHERE trans_id = ?';

    const updates: string[] = ['status = ?'];
    const values: (string | number | TransactionStatus)[] = [params.status];

    if (params.actualAmount !== undefined) {
        updates.push('actual_amount = ?');
        values.push(params.actualAmount);
    }
    if (params.netAmount !== undefined) {
        updates.push('net_amount = ?');
        values.push(params.netAmount);
    }
    if (params.callbackRaw !== undefined) {
        updates.push('callback_raw = ?');
        values.push(params.callbackRaw);
    }
    if (params.discountRate !== undefined) {
        updates.push('discount_rate = ?');
        values.push(params.discountRate);
    }

    const query = `UPDATE trans_log SET ${updates.join(', ')} ${whereClause}`;
    values.push(params.idOrTransId);

    const stmt = db.prepare(query);
    stmt.run(...values);

    logger.info(`Đã cập nhật giao dịch ${params.idOrTransId} sang trạng thái ${params.status}`);
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
