import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';

/** Adds field paths without changing Nest's legacy validation error contract. */
export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (errors) => {
      const issues = errors.map(({ path, message }) => ({
        path: (path ?? []).map((segment) => {
          const key = typeof segment === 'object' ? segment.key : segment;
          return typeof key === 'number' ? key : String(key);
        }),
        message,
      }));
      return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: issues.map(({ path, message }) =>
          path.length ? `${path.join('.')}: ${message}` : message,
        ),
        // Paths stay relative to the validated value, including [] for scalars.
        issues,
      });
    },
  });
}
