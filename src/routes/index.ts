import { Router } from 'express';
import { apiKeyAuth } from '../common/middleware/auth.js';

const router = Router();

// Card Routes - /api/thesieutoc/*
import thesieutocRoutes from '../modules/thesieutoc/thesieutoc.routes.js';
router.use('/thesieutoc', thesieutocRoutes);

// Transaction Routes - /api/transaction/*
import transactionRoutes from '../modules/transaction/transaction.routes.js';
router.use('/transaction', apiKeyAuth, transactionRoutes);

// PayOS Routes - /api/payos/*
import payosRoutes from '../modules/payos/payos.routes.js';
router.use('/payos', payosRoutes);

// System Routes - /api/system/*
import systemRoutes from '../modules/system/system.routes.js';
router.use('/system', apiKeyAuth, systemRoutes);

export default router;

