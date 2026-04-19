import { google } from "googleapis";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
const GOOGLE_REDIRECT_URI = process.env["GOOGLE_CALENDAR_REDIRECT_URI"] ?? "";

export function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export function generateAuthUrl(state: string): string {
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
}
