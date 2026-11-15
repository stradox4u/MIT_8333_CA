import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';

const httpErrorResponse = z.looseObject({
  statusCode: z.int(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
  issues: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.int()])),
        message: z.string(),
      }),
    )
    .optional(),
});

export const HTTP_ERROR_RESPONSE = { standardSchema: httpErrorResponse };

const descriptions = {
  400: 'Invalid request input; validation failures include field issues.',
  401: 'Authentication is missing, invalid or expired.',
  403: 'The account, permission or fresh-authentication requirement forbids this action.',
  404: 'The resource does not exist or is not visible to this User.',
  409: 'The action conflicts with the current account or request state.',
  429: 'Too many attempts; wait before retrying.',
  503: 'Photo storage is temporarily unavailable; retry the action.',
} as const;

/** Documents guard and business errors that return the shared HTTP envelope. */
export function ApiErrors(...statuses: (keyof typeof descriptions)[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: descriptions[status],
        ...HTTP_ERROR_RESPONSE,
      }),
    ),
  );
}
