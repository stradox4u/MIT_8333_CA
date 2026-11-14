import {
  MailConnectionError,
  MailMessageError,
  MailProviderError,
  MailTimeoutError,
  MailTransport,
  type MailAddress,
  type MailMessage,
  type MailTransportSendOptions,
} from '@nestjs/mail';

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 30_000;

/** Delivers the mailer's rendered messages through Brevo's transactional API. */
export class BrevoTransport extends MailTransport {
  // A private field keeps the credential out of transport logs and inspection.
  readonly #apiKey: string;

  constructor(apiKey: string) {
    super();
    if (!apiKey.trim())
      throw new TypeError('BrevoTransport requires BREVO_API_KEY');
    this.#apiKey = apiKey;
  }

  async send(message: MailMessage, { signal }: MailTransportSendOptions) {
    if (!message.to.length) {
      throw new MailMessageError(
        'to',
        'Brevo requires at least one To recipient',
      );
    }
    if (message.replyTo.length > 1) {
      throw new MailMessageError(
        'replyTo',
        'Brevo accepts one reply-to address',
      );
    }
    if (message.attachments.some((attachment) => attachment.cid)) {
      throw new MailMessageError(
        'attachments',
        'Brevo inline attachments are not supported',
      );
    }
    const body = {
      sender: address(message.from),
      to: message.to.map(address),
      ...(message.cc.length && { cc: message.cc.map(address) }),
      ...(message.bcc.length && { bcc: message.bcc.map(address) }),
      ...(message.replyTo.length && { replyTo: address(message.replyTo[0]) }),
      subject: message.subject,
      ...(message.html !== undefined && { htmlContent: message.html }),
      ...(message.text !== undefined && { textContent: message.text }),
      ...(Object.keys(message.headers).length && { headers: message.headers }),
      ...(message.attachments.length && {
        attachment: message.attachments.map((attachment) => ({
          name: attachment.filename,
          content: attachment.content.toString('base64'),
        })),
      }),
    };
    const timer = new AbortController();
    const timeout = setTimeout(
      () =>
        timer.abort(
          new MailTimeoutError('request', REQUEST_TIMEOUT_MS, 'api.brevo.com'),
        ),
      REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.#apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, timer.signal]),
        redirect: 'error',
      });
      if (!response.ok) {
        // Never log a provider response that could echo a sign-in link or key.
        await response.body?.cancel().catch(() => {});
        throw new MailProviderError({
          provider: 'brevo',
          status: response.status,
          retryAfterMs: retryAfter(response.headers.get('retry-after')),
        });
      }
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('messageId' in result) ||
        typeof result.messageId !== 'string' ||
        !result.messageId
      ) {
        throw new MailConnectionError('Brevo response is missing a messageId', {
          permanent: false,
        });
      }
      return {
        accepted: message.envelope.to,
        providerMessageId: result.messageId,
      };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (timer.signal.aborted) throw timer.signal.reason;
      if (
        error instanceof MailProviderError ||
        error instanceof MailConnectionError
      )
        throw error;
      throw new MailConnectionError('Brevo HTTPS request failed', {
        permanent: false,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function address(value: MailAddress) {
  return { email: value.address, ...(value.name && { name: value.name }) };
}

function retryAfter(value: string | null): number | undefined {
  if (value === null || !value.trim()) return undefined;
  const delay = Number(value);
  const milliseconds = Number.isFinite(delay)
    ? delay * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : undefined;
}
