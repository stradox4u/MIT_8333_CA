import { MailTransport, SmtpTransport } from '@nestjs/mail';

/**
 * Everything mail needs, defined once here; `AppConfig.mail` is declared as
 * this type, so a new setting can't be forgotten there.
 */
export interface MailSettings {
  transport: MailTransportKind;
  smtpUrl: string;
  from: string;
}

/**
 * Every mail provider the app can use, by `MAIL_TRANSPORT` value. Mailpit
 * (dev) and Brevo (production) both speak SMTP, so switching between them is
 * only `SMTP_URL`. Adding an HTTP-API provider (Resend, Postmark, SES,
 * SendGrid) is one entry here; the config schema reads its names from this.
 */
const TRANSPORTS = {
  smtp: (mail: MailSettings) => new SmtpTransport({ url: mail.smtpUrl }),
} satisfies Record<string, (mail: MailSettings) => MailTransport>;

export type MailTransportKind = keyof typeof TRANSPORTS;

export const MAIL_TRANSPORT_KINDS = Object.keys(TRANSPORTS) as [
  MailTransportKind,
  ...MailTransportKind[],
];

export function createMailTransport(mail: MailSettings): MailTransport {
  return TRANSPORTS[mail.transport](mail);
}
