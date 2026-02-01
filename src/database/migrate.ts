import { initializeDatabase } from './index.js';
import { logger } from '../common/utils/logger.js';

async function migrate() {
    try {
        logger.info('Running database migration...');
        initializeDatabase();
        logger.info('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();


