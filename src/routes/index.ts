import { Router } from 'express';

const router = Router();

// Card Routes - /api/card/*
import cardRoutes from '../modules/card/card.routes.js';
router.use('/card', cardRoutes);

// Transaction Routes - /api/transaction/*
import transactionRoutes from '../modules/transaction/transaction.routes.js';
router.use('/transaction', transactionRoutes);

// PayOS Routes - /api/payos/*
import payosRoutes from '../modules/payment/payos.routes.js';
router.use('/payos', payosRoutes);

// System Routes - /api/system/*
import systemRoutes from '../modules/system/system.routes.js';
router.use('/system', systemRoutes);

export default router;
