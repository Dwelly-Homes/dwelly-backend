import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AuthRequest, UserRole } from '../types';
import { sendError } from '../utils/response';

// Like authenticate, but does NOT reject requests with no/invalid token —
// it simply leaves req.user undefined and calls next().
export const optionalAuthenticate = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(authHeader.split(' ')[1]);
    } catch {
      // Invalid token — treat as unauthenticated, do not reject
    }
  }
  next();
};

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'No token provided. Please log in.', 401);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    sendError(res, 'Invalid or expired token. Please log in again.', 401);
  }
};

// ─── ROLE GUARDS ──────────────────────────────────────────────────────────────

export const requireRoles = (...roles: UserRole[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, 'You do not have permission to perform this action.', 403);
      return;
    }
    next();
  };

export const requireTenantAdmin = requireRoles(UserRole.TENANT_ADMIN);
export const requirePlatformAdmin = requireRoles(UserRole.PLATFORM_ADMIN);
export const requireAgentOrAdmin = requireRoles(
  UserRole.TENANT_ADMIN,
  UserRole.AGENT_STAFF,
  UserRole.PLATFORM_ADMIN
);

// ─── TENANT SCOPE GUARD ───────────────────────────────────────────────────────
// Ensures the resource being accessed belongs to the authenticated user's tenant

export const requireTenantMatch = (
  req: AuthRequest, res: Response, next: NextFunction
): void => {
  const { tenantId } = req.params;
  if (req.user?.role === UserRole.PLATFORM_ADMIN) return next(); // admins bypass
  if (!req.user?.tenantId || req.user.tenantId !== tenantId) {
    sendError(res, 'Access denied to this resource.', 403);
    return;
  }
  next();
};
