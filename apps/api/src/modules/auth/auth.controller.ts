import { z } from 'zod';
import { clearAuthCookie, setAuthCookie } from '../../lib/cookies';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import { loginSchema, registerSchema } from './auth.schema';
import * as authService from './auth.service';

export const register = asyncHandler(async (req, res) => {
  const { body } = getValidated<z.infer<typeof registerSchema>>(req);
  const result = await authService.register(body);
  setAuthCookie(res, result.token);
  sendSuccess(res, { user: result.user }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { body } = getValidated<z.infer<typeof loginSchema>>(req);
  const result = await authService.login(body);
  setAuthCookie(res, result.token);
  sendSuccess(res, { user: result.user });
});

export const logout = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await authService.logout(user.userId, user.organizationId);
  clearAuthCookie(res);
  sendSuccess(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const profile = await authService.getMe(user.userId, user.organizationId);
  sendSuccess(res, { user: profile });
});
