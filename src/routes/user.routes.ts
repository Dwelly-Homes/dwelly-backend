import { Router } from 'express';
import {
  getTeamMembers, inviteTeamMember, validateInvitation,
  acceptInvitation, updateTeamMemberRole, toggleTeamMemberStatus, removeTeamMember,
  searchSearchers,
} from '../controllers/user.controller';
import { authenticate, requireTenantAdmin, requireAgentOrAdmin } from '../middleware/auth';

const router = Router();

// ─── TEAM MANAGEMENT (tenant admin only) ─────────────────────────────────────
router.get('/',                            authenticate, requireTenantAdmin, getTeamMembers);
router.post('/invite',                     authenticate, requireTenantAdmin, inviteTeamMember);
router.patch('/:id/role',                  authenticate, requireTenantAdmin, updateTeamMemberRole);
router.patch('/:id/toggle-status',         authenticate, requireTenantAdmin, toggleTeamMemberStatus);
router.delete('/:id',                      authenticate, requireTenantAdmin, removeTeamMember);

// ─── SEARCHER SEARCH (agents only) ───────────────────────────────────────────
router.get('/search',                      authenticate, requireAgentOrAdmin, searchSearchers);

// ─── INVITATION (public — no auth needed) ─────────────────────────────────────
router.get('/invitations/validate',        validateInvitation);
router.post('/invitations/accept',         acceptInvitation);

export default router;
