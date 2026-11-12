import { createValidationPipe } from './validation.js';

it('normalizes Standard Schema path segments without inventing a field for pathless issues', async () => {
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: () => ({
        issues: [
          {
            path: ['people', { key: 2 }, { key: 'email' }],
            message: 'Invalid email',
          },
          { path: [Symbol('choice')], message: 'Invalid choice' },
          { message: 'Invalid input' },
        ],
      }),
    },
  };

  await expect(
    createValidationPipe().transform({}, { type: 'body', schema }),
  ).rejects.toMatchObject({
    response: {
      statusCode: 400,
      error: 'Bad Request',
      message: [
        'people.2.email: Invalid email',
        'Symbol(choice): Invalid choice',
        'Invalid input',
      ],
      issues: [
        { path: ['people', 2, 'email'], message: 'Invalid email' },
        { path: ['Symbol(choice)'], message: 'Invalid choice' },
        { path: [], message: 'Invalid input' },
      ],
    },
  });
});
