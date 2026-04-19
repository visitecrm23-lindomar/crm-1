import { google } from "googleapis";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
const GOOGLE_REDIRECT_URI = process.env["GOOGLE_CALENDAR_REDIRECT_URI"] ?? "";
const STATE_SECRET = process.env["CLERK_SECRET_KEY"] ?? "visitecrm-gcal-state-secret";

export function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function signState(userId: string, nonce: string): string {
  const payload = `${userId}:${nonce}`;
  const sig = createHmac("sha256", STATE_SECRET).update(payload).digest("base64url");
  return Buffer.from(JSON.stringify({ userId, nonce, sig })).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      userId: string;
      nonce: string;
      sig: string;
    };
    const expected = createHmac("sha256", STATE_SECRET)
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
    }).where(eq(usersTable.id, userId));

    return credentials.access_token;
  } catch {
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

  constructor(accessToken: string) {
    const auth = createOAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async createEvent(data: CalendarEventData): Promise<{ id: string } | null> {
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
      console.error("[GoogleCalendarService] createEvent error:", err);
      return null;
    }
  }

  async updateEvent(eventId: string, data: Partial<CalendarEventData>): Promise<boolean> {
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
      console.error("[GoogleCalendarService] updateEvent error:", err);
      return false;
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await this.calendar.events.delete({
        calendarId: "primary",
        eventId,
        sendUpdates: "none",
      });
      return true;
    } catch (err) {
      console.error("[GoogleCalendarService] deleteEvent error:", err);
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
      console.error("[GoogleCalendarService] listEvents error:", err);
      return [];
    }
  }
}
