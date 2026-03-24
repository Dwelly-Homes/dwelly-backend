import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { AuditAction, JwtPayload } from '../types';

interface AuditOptions {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  req?: Request;
  actor?: JwtPayload | null;
}

export const createAuditLog = async (options: AuditOptions): Promise<void> => {
  try {
    const { action, resourceType, resourceId, payload, req, actor } = options;

    await AuditLog.create({
      actorId:      actor?.userId    ?? null,
      actorEmail:   null,             // enriched separately if needed
      actorRole:    actor?.role      ?? null,
      tenantId:     actor?.tenantId  ?? null,
      action,
      resourceType,
      resourceId:   resourceId       ?? null,
      ipAddress:    req?.ip          ?? null,
      userAgent:    req?.headers['user-agent'] ?? null,
      payload:      payload          ?? null,
    });
  } catch (err) {
    // Audit failures must never crash the main request
    console.error('Audit log write failed:', err);
  }
};
