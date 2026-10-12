import axios from 'axios';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ message?: string }>;
  };
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const body = error.response?.data as ErrorBody | undefined;
    const detail = body?.error?.details?.[0]?.message;
    const message = detail || body?.error?.message || 'The request could not be completed.';
    return new ApiError(status, body?.error?.code ?? 'REQUEST_FAILED', message);
  }
  return new ApiError(500, 'REQUEST_FAILED', 'The request could not be completed.');
}

export function messageFor(error: unknown): string {
  const apiError = toApiError(error);
  if (apiError.status === 401) {
    return 'Your session has expired. Sign in again.';
  }
  if (apiError.status === 403) {
    return 'You do not have permission to do that.';
  }
  if (apiError.status === 404) {
    return apiError.message || 'That record was not found.';
  }
  if (apiError.status === 400 || apiError.status === 422) {
    return apiError.message;
  }
  if (apiError.status >= 500) {
    return 'The server could not complete that request. Try again in a moment.';
  }
  return apiError.message;
}
