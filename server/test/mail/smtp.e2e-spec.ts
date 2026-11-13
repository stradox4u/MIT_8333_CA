import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { ConfigService } from '@nestjs/config';
import { Mailer, MailModule } from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { AppConfig } from '../../src/config/app-config.js';
import { environment, type Environment } from '../../src/config/environment.js';
import { createMailTransport } from '../../src/mail/mail-transport.js';

describe('Configured SMTP delivery to a trusted plaintext relay', () => {
  let relay: Server;
  let port: number;
  const connections = new Set<Socket>();
  const delivered: string[] = [];

  beforeAll(async () => {
    relay = createServer((socket) => {
      connections.add(socket);
      socket.on('close', () => connections.delete(socket));
      socket.on('error', () => {});
      socket.write('220 test SMTP ready\r\n');
      let data: string[] | undefined;
      createInterface({ input: socket, crlfDelay: Infinity }).on(
        'line',
        (line) => {
          if (data) {
            if (line === '.') {
              delivered.push(data.join('\n'));
              data = undefined;
              socket.write('250 queued\r\n');
            } else data.push(line);
          } else if (line.startsWith('EHLO '))
            socket.write('250 test relay\r\n');
          else if (line === 'DATA') {
            data = [];
            socket.write('354 send message\r\n');
          } else if (line === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('250 ok\r\n');
        },
      );
    });
    await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve));
    port = (relay.address() as AddressInfo).port;
  });
  beforeEach(() => delivered.splice(0));
  afterAll(async () => {
    for (const socket of connections) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      relay.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function send(startTls?: string, host = '[::ffff:127.0.0.1]') {
    // Mapped loopback reaches this local relay without the transport's special
    // localhost default, reproducing the policy used for Docker service names.
    const settings = environment.parse({
      APP_URL: 'https://maintenance.example',
      DATABASE_URL: 'postgres://test:test@localhost/test',
      SMTP_URL: `smtp://${host}:${port}`,
      MAIL_FROM: 'Sender <sender@example.test>',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      ...(startTls && { SMTP_STARTTLS: startTls }),
    });
    const config = new AppConfig(
      new ConfigService<Environment, true>(settings),
    );
    const module = await Test.createTestingModule({
      imports: [
        MailModule.forRoot({
          transport: createMailTransport(config.mail),
          from: config.mail.from,
          retry: false,
        }),
      ],
    }).compile();
    await module.init();
    try {
      return await module.get(Mailer).send({
        to: 'recipient@example.test',
        subject: 'Regression delivery',
        text: 'SMTP regression body',
      });
    } finally {
      await module.close();
    }
  }

  it('delivers when opportunistic STARTTLS is explicitly selected for the relay', async () => {
    await send('opportunistic');
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain('SMTP regression body');
  });

  it('still requires STARTTLS for a non-localhost SMTP host by default', async () => {
    await expect(send()).rejects.toThrow("doesn't offer STARTTLS");
    expect(delivered).toHaveLength(0);
  });

  it('preserves the transport default for ordinary localhost development', async () => {
    await send(undefined, '127.0.0.1');
    expect(delivered).toHaveLength(1);
  });
});
