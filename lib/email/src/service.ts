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
import { ReferralExpiringSoonEmail, type ReferralExpiringSoonEmailProps } from './templates/referral-expiring-soon';
import { ReferralBonusReleasedEmail, type ReferralBonusReleasedEmailProps } from './templates/referral-bonus-released';
import { ReferralWelcomeEmail, type ReferralWelcomeEmailProps } from './templates/referral-welcome';
import { ReferralTierUpgradeEmail, type ReferralTierUpgradeEmailProps } from './templates/referral-tier-upgrade';
import { NpsSurveyEmail, type NpsSurveyEmailProps } from './templates/nps-survey';
export type { ReferralWelcomeEmailProps };
export type { ReferralTierUpgradeEmailProps };

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

export type { ReferralBonusPaidEmailProps, ReferralConvertedEmailProps, ReferralExpiredEmailProps, ReferralBonusReleasedEmailProps };

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

export async function sendReferralBonusReleasedEmail(
  props: ReferralBonusReleasedEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject: `🎉 Seu bônus de indicação está disponível para resgate! — ${props.agencyName}`,
      react: React.createElement(ReferralBonusReleasedEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral bonus released email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral bonus released email:', message);
    return { success: false, error: message };
  }
}

export interface SendRedisAlertEmailOptions {
  to: string;
  status: "degraded" | "unavailable";
  /** Absolute URL to the admin dashboard. When null the CTA button is omitted. */
  dashboardUrl: string | null;
}

export async function sendRedisAlertEmail(opts: SendRedisAlertEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const statusLabel = opts.status === "unavailable" ? "Indisponível" : "Degradado";
    const subject = `[VisiteCRM] Alerta: Redis ${statusLabel}`;
    const dashboardButton = opts.dashboardUrl
      ? `<p style="margin-top: 24px;">
          <a href="${opts.dashboardUrl}" style="background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
            Acessar o painel de administração
          </a>
        </p>`
      : '';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #dc2626;">⚠️ Alerta de Infraestrutura — Redis ${statusLabel}</h2>
        <p>O Redis está com status <strong>${statusLabel}</strong>.</p>
        <p>Isso pode afetar filas de e-mail, jobs em background e outras funcionalidades que dependem do Redis.</p>
        ${dashboardButton}
        <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
          Este alerta é enviado no máximo uma vez por hora. Horário do alerta: ${new Date().toISOString()}
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'VisiteCRM <reservas@resend.visitecrm.com>',
      to: [opts.to],
      subject,
      html,
    });

    if (error) {
      console.error('[email] Failed to send Redis alert email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending Redis alert email:', message);
    return { success: false, error: message };
  }
}

export interface SendRedisRecoveryEmailOptions {
  to: string;
  /** Absolute URL to the admin dashboard. When null the CTA button is omitted. */
  dashboardUrl: string | null;
}

export async function sendRedisRecoveryEmail(opts: SendRedisRecoveryEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const dashboardButton = opts.dashboardUrl
      ? `<p style="margin-top: 24px;">
          <a href="${opts.dashboardUrl}" style="background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
            Acessar o painel de administração
          </a>
        </p>`
      : '';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #16a34a;">✅ Infraestrutura Normalizada — Redis Recuperado</h2>
        <p>O Redis voltou ao estado <strong>normal</strong> após um período de instabilidade.</p>
        <p>As filas de e-mail, jobs em background e demais funcionalidades dependentes do Redis estão operando normalmente.</p>
        ${dashboardButton}
        <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
          Horário da recuperação: ${new Date().toISOString()}
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'VisiteCRM <reservas@resend.visitecrm.com>',
      to: [opts.to],
      subject: '[VisiteCRM] Redis recuperado — sistema normalizado',
      html,
    });

    if (error) {
      console.error('[email] Failed to send Redis recovery email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending Redis recovery email:', message);
    return { success: false, error: message };
  }
}

export async function sendReferralWelcomeEmail(
  props: ReferralWelcomeEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject: `🎁 Seu código de indicação ${props.referralCode} está pronto! — ${props.agencyName}`,
      react: React.createElement(ReferralWelcomeEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral welcome email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral welcome email:', message);
    return { success: false, error: message };
  }
}

export interface SendRedisDailyLimitAlertEmailOptions {
  to: string;
  usagePct: number;
  commandCount: number;
  maxCommands: number;
  warningThresholdPct: number;
  dashboardUrl: string | null;
}

export async function sendRedisDailyLimitAlertEmail(opts: SendRedisDailyLimitAlertEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const usagePctRounded = Math.round(opts.usagePct * 10) / 10;
    const subject = `[VisiteCRM] Alerta: Redis com ${usagePctRounded}% do limite diário`;
    const dashboardButton = opts.dashboardUrl
      ? `<p style="margin-top: 24px;">
          <a href="${opts.dashboardUrl}" style="background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
            Acessar o painel de administração
          </a>
        </p>`
      : '';
    const barColor = opts.usagePct >= 90 ? '#dc2626' : '#f59e0b';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: ${barColor};">⚠️ Alerta de Limite Diário — Redis Upstash</h2>
        <p>O uso de requisições Redis hoje atingiu <strong>${usagePctRounded}%</strong> do limite diário (threshold configurado: ${opts.warningThresholdPct}%).</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Requisições usadas</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">${opts.commandCount.toLocaleString('pt-BR')}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Limite diário</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">${opts.maxCommands.toLocaleString('pt-BR')}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">Uso atual</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; color: ${barColor};">${usagePctRounded}%</td>
          </tr>
        </table>
        <div style="background: #f3f4f6; border-radius: 8px; height: 12px; margin: 16px 0; overflow: hidden;">
          <div style="background: ${barColor}; height: 100%; width: ${Math.min(100, opts.usagePct)}%;"></div>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Se o limite for atingido, filas de e-mail e jobs em background passarão a rodar de forma síncrona até a renovação diária. Considere reduzir o número de operações Redis ou fazer upgrade do plano Upstash.</p>
        ${dashboardButton}
        <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
          Este alerta é enviado no máximo uma vez por hora. Horário do alerta: ${new Date().toISOString()}
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'VisiteCRM <reservas@resend.visitecrm.com>',
      to: [opts.to],
      subject,
      html,
    });

    if (error) {
      console.error('[email] Failed to send Redis daily limit alert email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending Redis daily limit alert email:', message);
    return { success: false, error: message };
  }
}

export async function sendReferralExpiringSoonEmail(
  props: ReferralExpiringSoonEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const daysLabel = props.daysLeft <= 1 ? '1 dia' : `${props.daysLeft} dias`;
    const subject = `⏰ Seu código ${props.referralCode} vence em ${daysLabel} — ${props.agencyName}`;

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject,
      react: React.createElement(ReferralExpiringSoonEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral expiring soon email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral expiring soon email:', message);
    return { success: false, error: message };
  }
}

export async function sendReferralTierUpgradeEmail(
  props: ReferralTierUpgradeEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject: `Você subiu para o nível ${props.newTierLabel}! — ${props.agencyName}`,
      react: React.createElement(ReferralTierUpgradeEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send referral tier upgrade email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral tier upgrade email:', message);
    return { success: false, error: message };
  }
}

export interface SendReferralReversedEmailProps {
  referrerName: string;
  referrerEmail: string;
  agencyName: string;
  agencyLogo?: string | null;
  referredName?: string | null;
  bonusAmount?: number | null;
  newPendingBalance?: number | null;
  reason?: string | null;
}

export async function sendReferralReversedEmail(
  props: SendReferralReversedEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const firstName = props.referrerName.split(' ')[0];
    const subject = `Atualização sobre sua indicação — ${props.agencyName}`;

    const bonusLine = props.bonusAmount != null
      ? `<p>O bônus de <strong>R$ ${props.bonusAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> referente a essa indicação foi estornado do seu saldo.</p>`
      : `<p>Infelizmente, com o cancelamento, a indicação correspondente foi revertida e o bônus associado foi descontado do seu saldo.</p>`;

    const reasonLabels: Record<string, string> = {
      reservation_cancelled: 'cancelamento de reserva',
      trip_cancelled: 'cancelamento da excursão',
    };
    const reasonLabel = props.reason ? (reasonLabels[props.reason] ?? props.reason) : null;

    const referredLine = props.referredName
      ? `<p>A reserva do(a) indicado(a) <strong>${props.referredName}</strong> foi cancelada pela agência <strong>${props.agencyName}</strong>.</p>`
      : `<p>Informamos que uma reserva vinculada à sua indicação foi cancelada pela agência <strong>${props.agencyName}</strong>.</p>`;

    const reasonLine = reasonLabel
      ? `<p><strong>Motivo:</strong> ${reasonLabel.charAt(0).toUpperCase() + reasonLabel.slice(1)}.</p>`
      : '';

    const balanceLine = props.newPendingBalance != null
      ? `<p>Seu saldo de bônus atual é de <strong>R$ ${props.newPendingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>.</p>`
      : '';

    const htmlBody = `<p>Olá, <strong>${firstName}</strong>!</p>
${referredLine}
${reasonLine}
${bonusLine}
${balanceLine}
<p>Se você tiver dúvidas, entre em contato com a agência.</p>
<p>Obrigado por continuar indicando!</p>
<p>— ${props.agencyName}</p>`;

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.referrerEmail],
      subject,
      html: htmlBody,
    });

    if (error) {
      console.error('[email] Failed to send referral reversed email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral reversed email:', message);
    return { success: false, error: message };
  }
}

export interface SendReferralCodeSuspendedEmailProps {
  clientName: string;
  clientEmail: string;
  referralCode: string;
  status: "blocked" | "cancelled";
  agencyName: string;
  agencyLogo?: string | null;
}

export async function sendReferralCodeSuspendedEmail(
  props: SendReferralCodeSuspendedEmailProps
): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const firstName = props.clientName.split(' ')[0];
    const statusLabel = props.status === "blocked" ? "bloqueado temporariamente" : "cancelado";
    const statusCapitalized = props.status === "blocked" ? "Bloqueado" : "Cancelado";
    const subject = `Código de indicação ${statusCapitalized} — ${props.agencyName}`;

    const htmlBody = `<p>Olá, <strong>${firstName}</strong>!</p>
<p>Informamos que seu código de indicação <strong>${props.referralCode}</strong> foi <strong>${statusLabel}</strong> pela agência <strong>${props.agencyName}</strong>.</p>
<p>Durante este período, seu código não poderá ser compartilhado nem utilizado por novos indicados.</p>
<p>Caso tenha dúvidas ou acredite que isso foi um engano, entre em contato diretamente com a agência.</p>
<p>— ${props.agencyName}</p>`;

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.clientEmail],
      subject,
      html: htmlBody,
    });

    if (error) {
      console.error('[email] Failed to send referral code suspended email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending referral code suspended email:', message);
    return { success: false, error: message };
  }
}

export async function sendNpsSurveyEmail(props: NpsSurveyEmailProps): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const firstName = props.clientName.split(' ')[0];

    const { data, error } = await resend.emails.send({
      from: `${props.agencyName} <reservas@resend.visitecrm.com>`,
      to: [props.clientEmail],
      subject: `${firstName}, como foi sua viagem? Deixe sua avaliação ✈️`,
      react: React.createElement(NpsSurveyEmail, props),
    });

    if (error) {
      console.error('[email] Failed to send NPS survey email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error sending NPS survey email:', message);
    return { success: false, error: message };
  }
}

export type { NpsSurveyEmailProps };
