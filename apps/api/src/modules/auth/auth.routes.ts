import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../utils/zod';
import * as authController from './auth.controller';
import { loginSchema, registerSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), authController.register);
authRouter.post('/login', validate(loginSchema), authController.login);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.get('/me', requireAuth, authController.me);
