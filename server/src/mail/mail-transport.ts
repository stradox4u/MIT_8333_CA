import { MailTransport, SmtpTransport } from '@nestjs/mail';
import type { AppConfig } from '../config/app-config.js';

/**
 * The one place that knows which mail provider is in use. Mailpit (dev) and
 * Brevo (production) both speak SMTP, so switching between them is only
 * `SMTP_URL`. Adding an HTTP-API provider (Resend, Postmark, SES, SendGrid)
 * means adding a case here and a value to `MAIL_TRANSPORT`.
 */
export function createMailTransport(mail: AppConfig['mail']): MailTransport {
  switch (mail.transport) {
    case 'smtp':
      return new SmtpTransport({ url: mail.smtpUrl });
  }
}
