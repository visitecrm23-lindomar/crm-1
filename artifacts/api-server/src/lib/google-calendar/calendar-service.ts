import { google } from "googleapis";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export const CALENDAR_STATUS_CONNECTED = "connected";
export const CALENDAR_STATUS_INVALID = "invalid";

export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: number | string; response?: { status?: number; data?: { error?: string } }; message?: string };
  const status = anyErr.response?.status ?? (typeof anyErr.code === "number" ? anyErr.code : undefined);
  const errorCode = anyErr.response?.data?.error;
  if (errorCode === "invalid_grant" || errorCode === "invalid_token") return true;
  if (status === 401) return true;
  if (typeof anyErr.message === "string" && (anyErr.message.includes("invalid_grant") || anyErr.message.includes("invalid_token"))) return true;
  return false;
}

export async function markCalendarConnectionInvalid(userId: string, reason: string): Promise<void> {
  await db.update(usersTable).set({
    googleCalendarStatus: CALENDAR_STATUS_INVALID,
    googleCalendarEnabled: false,
  }).where(eq(usersTable.id, userId));
  logger.warn({ userId, reason }, "google-calendar: connection marked invalid (user must reconnect)");
}

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";

function getRedirectUri(): string {
  if (process.env["GOOGLE_CALENDAR_REDIRECT_URI"]) {
    return process.env["GOOGLE_CALENDAR_REDIRECT_URI"];
  }
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) {
    return `https://${domain}/api/calendar/callback`;
  }
  const frontendUrl = process.env["FRONTEND_URL"];
  if (frontendUrl) {
    try {
      const { origin } = new URL(frontendUrl);
      return `${origin}/api/calendar/callback`;
    } catch {
      // ignore invalid URL, fall through
    }
  }
  return "http://localhost:8080/api/calendar/callback";
}

function getStateSecret(): string {
  const s = process.env["CLERK_SECRET_KEY"];
  if (!s) throw new Error("CLERK_SECRET_KEY is required for Google Calendar OAuth state signing");
  return s;
}

export function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, getRedirectUri());
}

function signState(userId: string, nonce: string): string {
  const payload = `${userId}:${nonce}`;
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
  return Buffer.from(JSON.stringify({ userId, nonce, sig })).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      userId: string;
      nonce: string;
      sig: string;
    };
    const expected = createHmac("sha256", getStateSecret())
      .update(`${decoded.userId}:${decoded.nonce}`)
      .digest("base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    const actualBuf = Buffer.from(decoded.sig, "base64url");
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

export function generateAuthUrl(userId: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const state = signState(userId, nonce);
  const auth = createOAuth2Client();
  return auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const auth = createOAuth2Client();
  const { tokens } = await auth.getToken(code);
  return tokens;
}

export async function revokeToken(accessToken: string): Promise<void> {
  try {
    const auth = createOAuth2Client();
    await auth.revokeToken(accessToken);
  } catch {
    // Best effort — continue even if revoke fails
  }
}

export async function refreshTokenIfNeeded(userId: string): Promise<string | null> {
  const [user] = await db.select({
    googleAccessToken: usersTable.googleAccessToken,
    googleRefreshToken: usersTable.googleRefreshToken,
    googleTokenExpiry: usersTable.googleTokenExpiry,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user?.googleAccessToken) return null;

  const isExpired = user.googleTokenExpiry ? user.googleTokenExpiry <= new Date() : false;
  if (!isExpired) return user.googleAccessToken;

  if (!user.googleRefreshToken) return null;

  try {
    const auth = createOAuth2Client();
    auth.setCredentials({ refresh_token: user.googleRefreshToken });
    const { credentials } = await auth.refreshAccessToken();
    if (!credentials.access_token) return null;

    await db.update(usersTable).set({
      googleAccessToken: credentials.access_token,
      googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      googleCalendarStatus: CALENDAR_STATUS_CONNECTED,
    }).where(eq(usersTable.id, userId));

    return credentials.access_token;
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await markCalendarConnectionInvalid(userId, "refresh token rejected (invalid_grant)");
    } else {
      logger.error({ err, userId }, "google-calendar: refreshTokenIfNeeded failed");
    }
    return null;
  }
}

export interface CalendarEventData {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: Date;
  endDateTime?: Date;
  attendees?: string[];
  colorId?: string;
}

export class GoogleCalendarService {
  private calendar;
  readonly userId: string;

  constructor(accessToken: string, userId: string) {
    const auth = createOAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: "v3", auth });
    this.userId = userId;
  }

  private async handleApiError(err: unknown, op: string, ctx: Record<string, unknown> = {}): Promise<void> {
    if (isInvalidGrantError(err)) {
      await markCalendarConnectionInvalid(this.userId, `${op} returned invalid credentials`);
    } else {
      logger.error({ err, userId: this.userId, ...ctx }, `google-calendar: ${op} failed`);
    }
  }

  async createEvent(data: CalendarEventData, ctx: Record<string, unknown> = {}): Promise<{ id: string } | null> {
    try {
      const end = data.endDateTime ?? data.startDateTime;
      const event = {
        summary: data.summary,
        description: data.description,
        location: data.location,
        start: { dateTime: data.startDateTime.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
        attendees: data.attendees?.map((email) => ({ email })),
        colorId: data.colorId ?? "9",
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email" as const, minutes: 24 * 60 },
            { method: "popup" as const, minutes: 30 },
          ],
        },
      };
      const response = await this.calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
        sendUpdates: "none",
      });
      return { id: response.data.id! };
    } catch (err) {
      await this.handleApiError(err, "createEvent", ctx);
      return null;
    }
  }

  async updateEvent(eventId: string, data: Partial<CalendarEventData>, ctx: Record<string, unknown> = {}): Promise<boolean> {
    try {
      const patch: Record<string, unknown> = {};
      if (data.summary) patch.summary = data.summary;
      if (data.description !== undefined) patch.description = data.description;
      if (data.location !== undefined) patch.location = data.location;
      if (data.startDateTime) {
        patch.start = { dateTime: data.startDateTime.toISOString(), timeZone: "America/Sao_Paulo" };
      }
      if (data.endDateTime) {
        patch.end = { dateTime: data.endDateTime.toISOString(), timeZone: "America/Sao_Paulo" };
      }
      if (data.attendees) {
        patch.attendees = data.attendees.map((email) => ({ email }));
      }
      await this.calendar.events.patch({
        calendarId: "primary",
        eventId,
        requestBody: patch,
        sendUpdates: "none",
      });
      return true;
    } catch (err) {
      await this.handleApiError(err, "updateEvent", { ...ctx, eventId });
      return false;
    }
  }

  async deleteEvent(eventId: string, ctx: Record<string, unknown> = {}): Promise<boolean> {
    try {
      await this.calendar.events.delete({
        calendarId: "primary",
        eventId,
        sendUpdates: "none",
      });
      return true;
    } catch (err) {
      await this.handleApiError(err, "deleteEvent", { ...ctx, eventId });
      return false;
    }
  }

  async listEvents(timeMin: Date, timeMax: Date): Promise<Array<{ id: string; summary: string }>> {
    try {
      const resp = await this.calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });
      return (resp.data.items ?? [])
        .filter((e) => e.id && e.summary)
        .map((e) => ({ id: e.id!, summary: e.summary! }));
    } catch (err) {
      await this.handleApiError(err, "listEvents");
      return [];
    }
  }
}
