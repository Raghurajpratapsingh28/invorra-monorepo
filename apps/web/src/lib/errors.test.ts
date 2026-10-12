import { describe, expect, it } from 'vitest';
import { ApiError, messageFor } from './errors';

describe('messageFor', () => {
  it('explains auth and server failures', () => {
    expect(messageFor(new ApiError(401, 'UNAUTHORIZED', 'Authentication required'))).toMatch(/session/i);
    expect(messageFor(new ApiError(403, 'FORBIDDEN', 'nope'))).toMatch(/permission/i);
    expect(messageFor(new ApiError(404, 'NOT_FOUND', 'Product not found'))).toBe('Product not found');
    expect(messageFor(new ApiError(422, 'VALIDATION_ERROR', 'SKU is invalid'))).toBe('SKU is invalid');
    expect(messageFor(new ApiError(500, 'INTERNAL_ERROR', 'boom'))).toMatch(/server/i);
  });
});
