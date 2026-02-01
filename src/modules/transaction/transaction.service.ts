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
 * Get unified transaction history (latest transactions from both Card & PayOS)
 */
export function getTransactionHistory(limit: number = 10): any[] {
    const stmt = db.prepare(`
    SELECT 
        'card' as method,
        id, 
        name, 
        amount, 
        seri, 
        pin, 
        type, 
        status, 
        trans_id, 
        date
    FROM trans_log
    UNION ALL
    SELECT 
        'payos' as method,
        orderCode as id, 
        description as name, 
        amount, 
        '' as seri, 
        '' as pin, 
        'PayOS' as type, 
        CASE 
            WHEN status = 'SUCCESS' THEN 1
            WHEN status = 'FAILED' THEN 2
            WHEN status = 'CANCELLED' THEN 2
            ELSE 0 
        END as status,
        CAST(orderCode AS TEXT) as trans_id, 
        createdAt as date
    FROM payos_log
    ORDER BY date DESC LIMIT ?
  `);

    return stmt.all(limit);
}

/**
 * Get transaction by ID (Checks both Card and PayOS)
 */
export function getTransactionById(id: number): any | undefined {
    // Try card first
    const cardStmt = db.prepare('SELECT *, \'card\' as method FROM trans_log WHERE id = ?');
    const cardTx = cardStmt.get(id);
    if (cardTx) return cardTx;

    // Try payos
    const payosStmt = db.prepare(`
    SELECT 
        'payos' as method,
        orderCode as id, 
        description as name, 
        amount, 
        '' as seri, 
        '' as pin, 
        'PayOS' as type, 
        CASE 
            WHEN status = 'SUCCESS' THEN 1
            WHEN status = 'FAILED' THEN 2
            WHEN status = 'CANCELLED' THEN 2
            ELSE 0 
        END as status,
        CAST(orderCode AS TEXT) as trans_id, 
        createdAt as date,
        reference,
        payment_method,
        counter_account_name,
        counter_account_number
    FROM payos_log 
    WHERE orderCode = ?
  `);
    return payosStmt.get(id);
}

/**
 * Get transaction by trans_id
 */
export function getTransactionByTransId(transId: string): any | undefined {
    const stmt = db.prepare('SELECT *, \'card\' as method FROM trans_log WHERE trans_id = ?');
    const cardTx = stmt.get(transId);
    if (cardTx) return cardTx;

    // Try payos orderCode
    const orderCode = parseInt(transId);
    if (!isNaN(orderCode)) {
        return getTransactionById(orderCode);
    }
    return undefined;
}

/**
 * Search transactions across both Card and PayOS
 */
export function searchTransactions(criteria: {
    trans_id?: string;
    code?: string; // trans_id or request_id or orderCode
    serial?: string;
    pin?: string;
    status?: number;
    limit?: number;
    offset?: number;
}): any[] {
    const limit = criteria.limit || 20;
    const offset = criteria.offset || 0;

    let cardQuery = 'SELECT \'card\' as method, id, name, amount, seri, pin, type, status, trans_id, date FROM trans_log WHERE 1=1';
    let payosQuery = `
    SELECT 
        'payos' as method,
        orderCode as id, 
        description as name, 
        amount, 
        '' as seri, 
        '' as pin, 
        'PayOS' as type, 
        CASE 
            WHEN status = 'SUCCESS' THEN 1
            WHEN status = 'FAILED' THEN 2
            WHEN status = 'CANCELLED' THEN 2
            ELSE 0 
        END as status,
        CAST(orderCode AS TEXT) as trans_id, 
        createdAt as date
    FROM payos_log 
    WHERE 1=1
  `;

    const cardParams: any[] = [];
    const payosParams: any[] = [];

    if (criteria.trans_id) {
        cardQuery += ' AND trans_id = ?';
        cardParams.push(criteria.trans_id);

        payosQuery += ' AND CAST(orderCode AS TEXT) = ?';
        payosParams.push(criteria.trans_id);
    }

    if (criteria.code) {
        cardQuery += ' AND (trans_id LIKE ? OR request_id LIKE ?)';
        cardParams.push(`%${criteria.code}%`, `%${criteria.code}%`);

        payosQuery += ' AND (CAST(orderCode AS TEXT) LIKE ? OR description LIKE ?)';
        payosParams.push(`%${criteria.code}%`, `%${criteria.code}%`);
    }

    if (criteria.serial) {
        cardQuery += ' AND seri = ?';
        cardParams.push(criteria.serial);

        // PayOS has no serial, so this branch will return nothing for PayOS if serial is provided
        payosQuery += ' AND 1=0';
    }

    if (criteria.pin) {
        cardQuery += ' AND pin = ?';
        cardParams.push(criteria.pin);

        // PayOS has no pin
        payosQuery += ' AND 1=0';
    }

    if (criteria.status !== undefined) {
        cardQuery += ' AND status = ?';
        cardParams.push(criteria.status);

        // Map status back to PayOS string for filtering if needed, but easier to use the CASE logic in a subquery or just handle it here.
        // For simplicity, we filter by the mapped numeric status
        payosQuery = `SELECT * FROM (${payosQuery}) AS p WHERE p.status = ?`;
        payosParams.push(criteria.status);
    }

    const unifiedQuery = `
    SELECT * FROM (${cardQuery})
    UNION ALL
    SELECT * FROM (${payosQuery})
    ORDER BY date DESC LIMIT ? OFFSET ?
  `;

    const allParams = [...cardParams, ...payosParams, limit, offset];
    const stmt = db.prepare(unifiedQuery);
    return stmt.all(...allParams);
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


