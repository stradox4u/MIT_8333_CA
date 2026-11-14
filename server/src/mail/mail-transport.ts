import { MailTransport, SmtpTransport } from '@nestjs/mail';
import { BrevoTransport } from './brevo-transport.js';

export const SMTP_STARTTLS_MODES = ['required', 'opportunistic'] as const;

/**
 * Everything mail needs, defined once here; `AppConfig.mail` is declared as
 * this type, so a new setting can't be forgotten there.
 */
export interface MailSettings {
  transport: MailTransportKind;
  smtpUrl?: string;
  brevoApiKey?: string;
  /** Omitted keeps the SMTP transport's secure host-dependent defaults. */
  startTls?: (typeof SMTP_STARTTLS_MODES)[number];
  from: string;
}

/** Mailpit uses SMTP locally; Brevo uses HTTPS in production. */
const TRANSPORTS = {
  smtp: (mail: MailSettings) =>
    new SmtpTransport({ url: mail.smtpUrl, startTls: mail.startTls }),
  brevo: (mail: MailSettings) => new BrevoTransport(mail.brevoApiKey ?? ''),
} satisfies Record<string, (mail: MailSettings) => MailTransport>;

export type MailTransportKind = keyof typeof TRANSPORTS;

export const MAIL_TRANSPORT_KINDS = Object.keys(TRANSPORTS) as [
  MailTransportKind,
  ...MailTransportKind[],
];

export function createMailTransport(mail: MailSettings): MailTransport {
  return TRANSPORTS[mail.transport](mail);
}
