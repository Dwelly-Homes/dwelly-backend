import { Router } from 'express';
import { createLease, getLeases, getMyLease, updateLease } from '../controllers/lease.controller';
import { authenticate, requireAgentOrAdmin } from '../middleware/auth';

const router = Router();

// ─── SEARCHER ─────────────────────────────────────────────────────────────────
router.get('/my', authenticate, getMyLease);

// ─── AGENT / ADMIN ────────────────────────────────────────────────────────────
router.get('/',         authenticate, requireAgentOrAdmin, getLeases);
router.post('/',        authenticate, requireAgentOrAdmin, createLease);
router.patch('/:id',    authenticate, requireAgentOrAdmin, updateLease);

export default router;
