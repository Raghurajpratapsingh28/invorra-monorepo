import type { Response } from 'express';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  pagination?: PaginationMeta,
): Response {
  const body: { success: true; data: T; pagination?: PaginationMeta } = {
    success: true,
    data,
  };
  if (pagination) {
    body.pagination = pagination;
  }
  return res.status(status).json(body);
}
