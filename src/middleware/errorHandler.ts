import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Mongoose duplicate key
  if ((err as NodeJS.ErrnoException).name === 'MongoServerError' &&
      (err as NodeJS.ErrnoException & { code?: number }).code === 11000) {
    const field = Object.keys((err as unknown as { keyValue: Record<string, unknown> }).keyValue ?? {})[0];
    sendError(res, `${field ?? 'Field'} already exists.`, 409);
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    sendError(res, 'Validation failed', 422, [err.message]);
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    sendError(res, 'Invalid token.', 401);
    return;
  }
  if (err.name === 'TokenExpiredError') {
    sendError(res, 'Token has expired.', 401);
    return;
  }

  // Multer errors
  if (err.name === 'MulterError') {
    sendError(res, `File upload error: ${err.message}`, 400);
    return;
  }

  // Known operational errors
  if ((err as AppError).isOperational) {
    sendError(res, err.message, (err as AppError).statusCode);
    return;
  }

  // Unknown errors — don't leak details in production
  console.error('Unhandled error:', err);
  sendError(
    res,
    process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
    500
  );
};

export const notFound = (_req: Request, res: Response): void => {
  sendError(res, 'The requested endpoint does not exist.', 404);
};
