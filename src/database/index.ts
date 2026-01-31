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

    // Create trans_log table
    db.exec(`
    CREATE TABLE IF NOT EXISTS trans_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      seri TEXT NOT NULL,
      pin TEXT NOT NULL,
      type TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      trans_id TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

    // Create indexes for better query performance
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trans_log_trans_id ON trans_log(trans_id);
    CREATE INDEX IF NOT EXISTS idx_trans_log_status ON trans_log(status);
    CREATE INDEX IF NOT EXISTS idx_trans_log_date ON trans_log(date);
  `);

    logger.info('Database đã khởi tạo thành công');

    // Create payos_log table
    db.exec(`
    CREATE TABLE IF NOT EXISTS payos_log (
      orderCode INTEGER PRIMARY KEY,
      amount INTEGER NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'PENDING',
      checkoutUrl TEXT,
      reference TEXT,
      transactionDateTime TEXT,
      createdAt TEXT DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

    // Add missing columns for existing tables (migration)
    const payosColumns = db.prepare('PRAGMA table_info(payos_log)').all() as { name: string }[];
    const existingColumns = payosColumns.map((c) => c.name);

    if (!existingColumns.includes('reference')) {
        db.exec('ALTER TABLE payos_log ADD COLUMN reference TEXT');
    }
    if (!existingColumns.includes('transactionDateTime')) {
        db.exec('ALTER TABLE payos_log ADD COLUMN transactionDateTime TEXT');
    }
    if (!existingColumns.includes('updatedAt')) {
        db.exec(
            "ALTER TABLE payos_log ADD COLUMN updatedAt TEXT DEFAULT (datetime('now', 'localtime'))"
        );
    }
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
    seri: string;
    pin: string;
    type: string;
    status: TransactionStatus;
    trans_id: string;
    date: string;
}

export interface PayOSTransaction {
    orderCode: number;
    amount: number;
    description: string;
    status: string;
    checkoutUrl: string;
    reference?: string;
    transactionDateTime?: string;
    createdAt: string;
    updatedAt?: string;
}
