import { Response } from 'express';
import { ApiResponse } from '../types';

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200,
  meta?: ApiResponse<T>['meta']
): Response => {
  const body: ApiResponse<T> = { success: true, message, data, meta };
  return res.status(statusCode).json(body);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown[]
): Response => {
  const body: ApiResponse = { success: false, message, errors };
  return res.status(statusCode).json(body);
};

export const sendPaginated = <T>(
  res: Response,
  message: string,
  data: T[],
  total: number,
  page: number,
  limit: number
): Response => {
  return sendSuccess(res, message, data, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
};
