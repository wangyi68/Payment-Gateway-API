import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    // TheSieuToc API
    THESIEUTOC_API_KEY: z.string().min(1, 'API key is required'),

    // Server
    PORT: z.string().default('3000').transform(Number),
    HOST: z.string().default('localhost'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Database
    DATABASE_PATH: z.string().default('./data/database.sqlite'),

    // Ngrok
    NGROK_AUTH_TOKEN: z.string().optional(),
    NGROK_DOMAIN: z.string().optional(), // Static domain like xxx.ngrok-free.dev

    // Redis (optional)
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.string().default('6379').transform(Number),
    REDIS_PASSWORD: z.string().optional(),

    // Scheduler
    SCHEDULER_ENABLED: z.string().default('true').transform(v => v === 'true'),

    // Cleanup
    CLEANUP_TRANSACTION_DAYS: z.string().default('90').transform(Number),
    CLEANUP_LOG_DAYS: z.string().default('30').transform(Number),
    CLEANUP_BLACKLIST_DAYS: z.string().default('180').transform(Number),

    // Validation
    DUPLICATE_CHECK_HOURS: z.string().default('24').transform(Number),

    // Logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
}

export const config = {
    thesieutoc: {
        apiKey: parsed.data.THESIEUTOC_API_KEY,
        baseUrl: 'https://thesieutoc.net',
        endpoints: {
            charging: '/chargingws/v2',
            cardInfo: '/card_info.php',
        },
    },
    server: {
        port: parsed.data.PORT,
        host: parsed.data.HOST,
        nodeEnv: parsed.data.NODE_ENV,
        isDev: parsed.data.NODE_ENV === 'development',
        isProd: parsed.data.NODE_ENV === 'production',
    },
    database: {
        path: parsed.data.DATABASE_PATH,
    },
    ngrok: {
        authToken: parsed.data.NGROK_AUTH_TOKEN,
        domain: parsed.data.NGROK_DOMAIN, // Static domain
    },
    redis: parsed.data.REDIS_HOST ? {
        host: parsed.data.REDIS_HOST,
        port: parsed.data.REDIS_PORT,
        password: parsed.data.REDIS_PASSWORD,
    } : null,
    scheduler: {
        enabled: parsed.data.SCHEDULER_ENABLED,
    },
    cleanup: {
        transactionDays: parsed.data.CLEANUP_TRANSACTION_DAYS,
        logDays: parsed.data.CLEANUP_LOG_DAYS,
        blacklistDays: parsed.data.CLEANUP_BLACKLIST_DAYS,
    },
    validation: {
        duplicateCheckHours: parsed.data.DUPLICATE_CHECK_HOURS,
    },
    logging: {
        level: parsed.data.LOG_LEVEL,
    },
} as const;

export type Config = typeof config;

