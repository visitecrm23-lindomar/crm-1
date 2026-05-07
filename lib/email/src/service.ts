import { Resend } from 'resend';
import * as React from 'react';
import { ReservationConfirmationEmail, type ReservationConfirmationEmailProps } from './templates/reservation-confirmation';
import { ReservationCancellationEmail, type ReservationCancellationEmailProps } from './templates/reservation-cancellation';
import { BirthdayEmail, type BirthdayEmailProps } from './templates/birthday';
import { WelcomeCredentialsEmail, type WelcomeCredentialsEmailProps } from './templates/welcome-credentials';
import { NewBookingNotificationEmail, type NewBookingNotificationEmailProps } from './templates/new-booking-notification';
import { ReferralBonusPaidEmail, type ReferralBonusPaidEmailProps } from './templates/referral-bonus-paid';
import { ReferralConvertedEmail, type ReferralConvertedEmailProps } from './templates/referral-converted';
import { ReferralExpiredEmail, type ReferralExpiredEmailProps } from './templates/referral-expired';

export type { ReservationCancellationEmailProps };

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

export async function sendReservationCancellationEmail(
  props: ReservationCancellationEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.clientEmail],
      subject: `Reserva Cancelada — ${props.reservationNumber}`,
      react: React.createElement(ReservationCancellationEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send reservation cancellation:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending reservation cancellation:', message);
    return { success: false, error: message };
  }
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
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
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
      from: `${opts.agencyName} <reservas@resend.visitecrm.com>`,
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
      from: `${fromName} <reservas@resend.visitecrm.com>`,
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
      from: `${opts.fromName} <reservas@resend.visitecrm.com>`,
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

export interface SendNewBookingNotificationOptions {
  to: string[];
  cc?: string[];
}

export async function sendNewBookingNotificationEmail(
  props: NewBookingNotificationEmailProps,
  opts: SendNewBookingNotificationOptions,
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const recipients = opts.to.filter((e) => !!e);
    if (recipients.length === 0) {
      return { success: false, error: 'No recipient address' };
    }

    const cc = (opts.cc ?? []).filter((e) => !!e && !recipients.includes(e));

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: recipients,
      ...(cc.length > 0 ? { cc } : {}),
      subject: `Nova reserva — ${props.reservationNumber} (${props.destination})`,
      react: React.createElement(NewBookingNotificationEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send new booking notification:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending new booking notification:', message);
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
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
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

export type { ReferralBonusPaidEmailProps, ReferralConvertedEmailProps, ReferralExpiredEmailProps };

export async function sendReferralBonusPaidEmail(
  props: ReferralBonusPaidEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject: `Seu bônus de indicação foi pago! — ${props.agencyName}`,
      react: React.createElement(ReferralBonusPaidEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral bonus paid email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral bonus paid email:', message);
    return { success: false, error: message };
  }
}

export async function sendReferralConvertedEmail(
  props: ReferralConvertedEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject: `Sua indicação foi confirmada! — ${props.agencyName}`,
      react: React.createElement(ReferralConvertedEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral converted email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral converted email:', message);
    return { success: false, error: message };
  }
}

export async function sendReferralExpiredEmail(
  props: ReferralExpiredEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject: `Sua indicação expirou — compartilhe novamente! — ${props.agencyName}`,
      react: React.createElement(ReferralExpiredEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral expired email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral expired email:', message);
    return { success: false, error: message };
  }
}
