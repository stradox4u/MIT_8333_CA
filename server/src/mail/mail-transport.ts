import { MailTransport, SmtpTransport } from '@nestjs/mail';

/**
 * The one place that knows which mail provider is in use. Mailpit (dev) and
 * Brevo (production) both speak SMTP, so switching between them is only
 * `SMTP_URL`. Adding an HTTP-API provider (Resend, Postmark, SES, SendGrid)
 * means adding a case here.
 */
export function createMailTransport(
  env: NodeJS.ProcessEnv = process.env,
): MailTransport {
  const kind = env.MAIL_TRANSPORT ?? 'smtp';
  switch (kind) {
    case 'smtp':
      return new SmtpTransport({ url: required(env, 'SMTP_URL') });
    default:
      throw new Error(`Unknown MAIL_TRANSPORT "${kind}"`);
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}
