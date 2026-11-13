import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';

/** One problem with a request's input, at a path relative to the validated value. */
export interface InputIssue {
  path: (string | number)[];
  message: string;
}

/**
 * The 400 every validation failure answers with: Nest's legacy `message`
 * array, plus the additive `issues` with their paths. Also for input a schema
 * can't check, such as an id that must name an existing row.
 */
export function invalidInput(issues: InputIssue[]) {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: issues.map(({ path, message }) =>
      path.length ? `${path.join('.')}: ${message}` : message,
    ),
    // Paths stay relative to the validated value, including [] for scalars.
    issues,
  });
}

/** Adds field paths without changing Nest's legacy validation error contract. */
export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (errors) =>
      invalidInput(
        errors.map(({ path, message }) => ({
          path: (path ?? []).map((segment) => {
            const key = typeof segment === 'object' ? segment.key : segment;
            return typeof key === 'number' ? key : String(key);
          }),
          message,
        })),
      ),
  });
}
