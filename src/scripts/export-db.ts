import fs from 'fs';
import path from 'path';
import { db } from '../database/index.js';
import { logger } from '../common/utils/logger.js';

async function exportDatabase() {
    try {
        logger.info('Bắt đầu quá trình export dữ liệu...');

        // 1. Lấy dữ liệu từ bảng trans_log
        const transLogs = db.prepare('SELECT * FROM trans_log ORDER BY id DESC').all();

        // 2. Lấy dữ liệu từ bảng payos_log
        const payosLogs = db.prepare('SELECT * FROM payos_log ORDER BY createdAt DESC').all();

        // 3. Lấy dữ liệu từ bảng blacklist (nếu có)
        let blacklist: unknown[] = [];
        try {
            blacklist = db.prepare('SELECT * FROM card_blacklist').all();
        } catch {
            logger.warn('Bảng card_blacklist chưa tồn tại hoặc trống.');
        }

        const exportData = {
            export_at: new Date().toISOString(),
            total_cards: transLogs.length,
            total_payments: payosLogs.length,
            data: {
                trans_log: transLogs,
                payos_log: payosLogs,
                card_blacklist: blacklist,
            },
        };

        // 4. Tạo tên file với timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `export_data_${timestamp}.json`;
        const exportPath = path.join(process.cwd(), 'data', fileName);

        // 5. Đảm bảo thư mục data tồn tại
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // 6. Ghi file
        fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf-8');

        logger.info(`Export thành công! File lưu tại: ${exportPath}`);
        logger.info(
            `\n✅ Đã export thành công ${transLogs.length} thẻ cào và ${payosLogs.length} đơn PayOS.`
        );
        logger.info(`📂 Đường dẫn: ${exportPath}\n`);
    } catch (error) {
        logger.error('Lỗi khi export database:', error);
        process.exit(1);
    }
}

exportDatabase();


