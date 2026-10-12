import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import { notFound } from '../../utils/errors';
import { chatSchema, confirmSchema, explainSchema } from './assistant.schema';
import * as assistantService from './assistant.service';

export const chat = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof chatSchema>>(req);
  const result = await assistantService.chat(user.organizationId, user.userId, body.message);
  sendSuccess(res, result);
});

export const confirm = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof confirmSchema>>(req);
  const result = await assistantService.confirmAction(
    user.organizationId,
    user.userId,
    body.confirmationId,
    body.confirm,
  );
  sendSuccess(res, result);
});

export const explain = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof explainSchema>>(req);
  const result = await assistantService.explainTarget(user.organizationId, body.target, body.id);
  if (!result) {
    throw notFound('Nothing to explain for that record');
  }
  sendSuccess(res, result);
});
