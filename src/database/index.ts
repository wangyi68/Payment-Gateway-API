import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';

// Ensure data directory exists
const dataDir = path.dirname(config.database.path);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.database.path);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

export function initializeDatabase(): void {
    logger.info('Đang khởi tạo database...');

    // Create trans_log table (Card Top-up)
    db.exec(`
    CREATE TABLE IF NOT EXISTS trans_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      declared_amount INTEGER DEFAULT 0,
      actual_amount INTEGER DEFAULT 0,
      discount_rate REAL DEFAULT 0,
      net_amount INTEGER DEFAULT 0,
      seri TEXT NOT NULL,
      pin TEXT NOT NULL,
      type TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      trans_id TEXT NOT NULL,
      request_id TEXT,
      callback_raw TEXT,
      ip_address TEXT,
      user_agent TEXT,
      date TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

    // Create indexes for better query performance
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trans_log_trans_id ON trans_log(trans_id);
    CREATE INDEX IF NOT EXISTS idx_trans_log_status ON trans_log(status);
    CREATE INDEX IF NOT EXISTS idx_trans_log_date ON trans_log(date);
  `);

    // Create payos_log table (Bank/QR)
    db.exec(`
    CREATE TABLE IF NOT EXISTS payos_log (
      orderCode INTEGER PRIMARY KEY,
      amount INTEGER NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'PENDING',
      checkoutUrl TEXT,
      reference TEXT,
      payment_method TEXT,
      counter_account_name TEXT,
      counter_account_number TEXT,
      transactionDateTime TEXT,
      canceledAt TEXT,
      createdAt TEXT DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

    // --- Migration Logic ---

    // 1. Migrate trans_log
    const transColumns = db.prepare('PRAGMA table_info(trans_log)').all() as { name: string }[];
    const transExisting = transColumns.map((c) => c.name);

    const newTransCols = [
        ['declared_amount', 'INTEGER DEFAULT 0'],
        ['actual_amount', 'INTEGER DEFAULT 0'],
        ['discount_rate', 'REAL DEFAULT 0'],
        ['net_amount', 'INTEGER DEFAULT 0'],
        ['request_id', 'TEXT'],
        ['callback_raw', 'TEXT'],
        ['ip_address', 'TEXT'],
        ['user_agent', 'TEXT'],
    ];

    newTransCols.forEach(([col, type]) => {
        if (!transExisting.includes(col as string)) {
            db.exec(`ALTER TABLE trans_log ADD COLUMN ${col} ${type}`);
        }
    });

    // 2. Migrate payos_log
    const payosColumns = db.prepare('PRAGMA table_info(payos_log)').all() as { name: string }[];
    const payosExisting = payosColumns.map((c) => c.name);

    const newPayosCols = [
        ['reference', 'TEXT'],
        ['payment_method', 'TEXT'],
        ['counter_account_name', 'TEXT'],
        ['counter_account_number', 'TEXT'],
        ['transactionDateTime', 'TEXT'],
        ['canceledAt', 'TEXT'],
        ['updatedAt', "TEXT DEFAULT (datetime('now', 'localtime'))"],
    ];

    newPayosCols.forEach(([col, type]) => {
        if (!payosExisting.includes(col as string)) {
            db.exec(`ALTER TABLE payos_log ADD COLUMN ${col} ${type}`);
        }
    });

    logger.info('Database đã khởi tạo và cập nhật thành công');
}

// Transaction status enum
export enum TransactionStatus {
    PENDING = 0, // Chờ duyệt
    SUCCESS = 1, // Thành công
    FAILED = 2, // Thất bại
    WRONG_AMOUNT = 3, // Sai mệnh giá
}

export interface Transaction {
    id: number;
    name: string;
    amount: number;
    declared_amount?: number;
    actual_amount?: number;
    discount_rate?: number;
    net_amount?: number;
    seri: string;
    pin: string;
    type: string;
    status: TransactionStatus;
    trans_id: string;
    request_id?: string;
    callback_raw?: string;
    ip_address?: string;
    user_agent?: string;
    date: string;
}

export interface PayOSTransaction {
    orderCode: number;
    amount: number;
    description: string;
    status: string;
    checkoutUrl: string;
    reference?: string;
    payment_method?: string;
    counter_account_name?: string;
    counter_account_number?: string;
    transactionDateTime?: string;
    canceledAt?: string;
    createdAt: string;
    updatedAt?: string;
}
