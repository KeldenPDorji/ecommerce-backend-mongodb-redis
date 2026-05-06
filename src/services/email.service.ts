import { logger } from '../utils/logger';

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Stub — wire up nodemailer/SendGrid/Postmark here
export async function sendEmail(opts: MailOptions): Promise<void> {
  logger.info('Email queued', { to: opts.to, subject: opts.subject });
  // TODO: replace with real transport
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Welcome to E‑Commerce!',
    text: `Hi ${name}, thanks for signing up.`,
    html: `<p>Hi <strong>${name}</strong>, thanks for signing up.</p>`,
  });
}

export async function sendOrderConfirmation(to: string, orderId: string): Promise<void> {
  await sendEmail({
    to,
    subject: `Order Confirmed — #${orderId}`,
    text: `Your order #${orderId} has been confirmed.`,
    html: `<p>Your order <strong>#${orderId}</strong> has been confirmed.</p>`,
  });
}
