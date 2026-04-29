import { Resend } from 'resend';
import * as React from 'react';
import { ReservationConfirmationEmail, type ReservationConfirmationEmailProps } from './templates/reservation-confirmation';
import { BirthdayEmail, type BirthdayEmailProps } from './templates/birthday';
import { WelcomeCredentialsEmail, type WelcomeCredentialsEmailProps } from './templates/welcome-credentials';

export interface SendManifestEmailOptions {
  to: string;
  tripName: string;
  manifestNumber: string | null;
  agencyName: string;
  htmlContent: string;
  pdfAttachment?: Buffer;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[email] RESEND_API_KEY not configured — email sending is disabled');
    return null;
  }
  return new Resend(key);
}

export async function sendReservationConfirmationEmail(
  props: ReservationConfirmationEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@visitecrm.com.br>`,
      to: [props.clientEmail],
      subject: `Reserva Confirmada — ${props.reservationNumber}`,
      react: React.createElement(ReservationConfirmationEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send reservation confirmation:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending reservation confirmation:', message);
    return { success: false, error: message };
  }
}

export interface SendBirthdayEmailOptions {
  emailSubject?: string | null;
  senderName?: string | null;
  emailMessage?: string | null;
}

export async function sendManifestEmail(opts: SendManifestEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const subject = `Manifesto ANTT — ${opts.tripName}${opts.manifestNumber ? ` (${opts.manifestNumber})` : ''}`;

    const safeName = (opts.tripName ?? 'manifesto')
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
      .slice(0, 60);

    const attachments = opts.pdfAttachment
      ? [{ filename: `manifesto-antt-${safeName}.pdf`, content: opts.pdfAttachment }]
      : undefined;

    const { data, error } = await resend.emails.send({
      from: `${opts.agencyName} <reservas@visitecrm.com.br>`,
      to: [opts.to],
      subject,
      html: opts.htmlContent,
      attachments,
    });

    if (error) {
      console.error('[email] Failed to send manifest email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending manifest email:', message);
    return { success: false, error: message };
  }
}

export async function sendBirthdayEmail(
  props: BirthdayEmailProps,
  options?: SendBirthdayEmailOptions
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const firstName = props.clientName.split(' ')[0];
    const fromName = options?.senderName || props.agencyName;
    const subject = options?.emailSubject
      ? options.emailSubject
          .replace(/\{\{name\}\}/gi, firstName)
          .replace(/\{\{coupon_code\}\}/gi, props.couponCode)
          .replace(/\{\{discount\}\}/gi, String(props.discountPercent))
          .replace(/\{\{valid_until\}\}/gi, props.validUntil)
          .replace(/\{\{agency_name\}\}/gi, props.agencyName)
      : `🎂 Feliz Aniversário, ${firstName}! Um presente especial para você`;

    const emailProps: BirthdayEmailProps = {
      ...props,
      customMessage: options?.emailMessage
        ? options.emailMessage
            .replace(/\{\{name\}\}/gi, props.clientName.split(' ')[0])
            .replace(/\{\{coupon_code\}\}/gi, props.couponCode)
            .replace(/\{\{discount\}\}/gi, String(props.discountPercent))
            .replace(/\{\{valid_until\}\}/gi, props.validUntil)
            .replace(/\{\{agency_name\}\}/gi, props.agencyName)
        : null,
    };

    const { data, error } = await resend.emails.send({
      from: `${fromName} <reservas@visitecrm.com.br>`,
      to: [props.clientEmail],
      subject,
      react: React.createElement(BirthdayEmail, emailProps),
    });

    if (error) {
      console.error('[email] Failed to send birthday email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending birthday email:', message);
    return { success: false, error: message };
  }
}

export interface SendReminderEmailOptions {
  to: string;
  subject: string;
  html: string;
  fromName: string;
}

export async function sendReminderHtmlEmail(opts: SendReminderEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${opts.fromName} <reservas@visitecrm.com.br>`,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    });

    if (error) {
      console.error('[email] Failed to send reminder email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending reminder email:', message);
    return { success: false, error: message };
  }
}

export async function sendWelcomeCredentialsEmail(
  props: WelcomeCredentialsEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@visitecrm.com.br>`,
      to: [props.clientEmail],
      subject: `Bem-vindo(a)! Acesse sua Área do Cliente — ${props.agencyName}`,
      react: React.createElement(WelcomeCredentialsEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send welcome credentials email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending welcome credentials email:', message);
    return { success: false, error: message };
  }
}
