export { ReservationConfirmationEmail } from './templates/reservation-confirmation';
export type { ReservationConfirmationEmailProps } from './templates/reservation-confirmation';
export { sendReservationConfirmationEmail, sendBirthdayEmail, sendManifestEmail, sendWelcomeCredentialsEmail, sendReminderHtmlEmail } from './service';
export type { SendEmailResult, SendManifestEmailOptions, SendReminderEmailOptions } from './service';
export { BirthdayEmail } from './templates/birthday';
export type { BirthdayEmailProps } from './templates/birthday';
export { WelcomeCredentialsEmail } from './templates/welcome-credentials';
export type { WelcomeCredentialsEmailProps } from './templates/welcome-credentials';
