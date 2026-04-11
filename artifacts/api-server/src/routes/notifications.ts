import { Router } from "express";
import { db } from "@workspace/db";
import { tripsTable, paymentsTable, clientsTable, systemConfigsTable } from "@workspace/db";
import { eq, and, lt, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";

const router = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const configs = await db.select().from(systemConfigsTable)
      .where(and(eq(systemConfigsTable.tenantId, me.tenantId), eq(systemConfigsTable.key, "notifications")));

    const notifConfig = (configs[0]?.value ?? {}) as Record<string, boolean>;
    const isEnabled = (key: string) => notifConfig[key] !== false;

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const alerts: {
      type: string;
      severity: string;
      title: string;
      message: string;
      link: string;
      entityId: string | null;
    }[] = [];

    if (isEnabled("tripReminder")) {
      const upcomingTrips = await db.select({
        id: tripsTable.id,
        name: tripsTable.name,
        departureDate: tripsTable.departureDate,
        totalCapacity: tripsTable.totalCapacity,
        availableSeats: tripsTable.availableSeats,
        reservedSeats: tripsTable.reservedSeats,
      }).from(tripsTable).where(
        and(
          eq(tripsTable.tenantId, me.tenantId),
          gte(tripsTable.departureDate, now),
          lte(tripsTable.departureDate, in7Days),
          eq(tripsTable.status, "active"),
        )
      );

      for (const trip of upcomingTrips) {
        const diffMs = new Date(trip.departureDate).getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const label = diffDays <= 1 ? "amanhã" : `em ${diffDays} dias`;
        alerts.push({
          type: "trip_reminder",
          severity: diffDays <= 1 ? "warning" : "info",
          title: "Viagem iminente",
          message: `${trip.name} parte ${label}`,
          link: `/trips/${trip.id}`,
          entityId: trip.id,
        });
      }
    }

    const overduePayments = await db.select({
      id: paymentsTable.id,
      description: paymentsTable.description,
      amount: paymentsTable.amount,
      dueDate: paymentsTable.dueDate,
      clientId: paymentsTable.clientId,
    }).from(paymentsTable).where(
      and(
        eq(paymentsTable.tenantId, me.tenantId),
        eq(paymentsTable.status, "pending"),
        eq(paymentsTable.type, "receivable"),
        lt(paymentsTable.dueDate, now),
      )
    );

    if (overduePayments.length > 0) {
      const totalOverdue = overduePayments.reduce((s, p) => s + Number(p.amount), 0);
      alerts.push({
        type: "overdue_payment",
        severity: "error",
        title: "Pagamentos vencidos",
        message: `${overduePayments.length} pagamento(s) vencido(s) — R$ ${totalOverdue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        link: "/financial",
        entityId: null,
      });
    }

    const allUpcomingTrips = await db.select({
      id: tripsTable.id,
      name: tripsTable.name,
      totalCapacity: tripsTable.totalCapacity,
      availableSeats: tripsTable.availableSeats,
      departureDate: tripsTable.departureDate,
    }).from(tripsTable).where(
      and(
        eq(tripsTable.tenantId, me.tenantId),
        gte(tripsTable.departureDate, now),
        eq(tripsTable.status, "active"),
      )
    );

    for (const trip of allUpcomingTrips) {
      if (trip.totalCapacity > 0) {
        const occupancy = ((trip.totalCapacity - trip.availableSeats) / trip.totalCapacity) * 100;
        if (occupancy < 50) {
          alerts.push({
            type: "low_occupancy",
            severity: "warning",
            title: "Baixa ocupação",
            message: `${trip.name} — ${Math.round(occupancy)}% ocupado`,
            link: `/trips/${trip.id}`,
            entityId: trip.id,
          });
        }
      }
    }

    if (isEnabled("birthdayAlert")) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const in7DaysEnd = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

      const allClients = await db.select({
        id: clientsTable.id,
        name: clientsTable.name,
        birthDate: clientsTable.birthDate,
      }).from(clientsTable).where(
        and(
          eq(clientsTable.tenantId, me.tenantId),
        )
      );

      const birthdaysThisWeek = allClients.filter(c => {
        if (!c.birthDate) return false;
        const bd = new Date(c.birthDate);
        const thisYearBirthday = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
        return thisYearBirthday >= startOfDay && thisYearBirthday <= in7DaysEnd;
      });

      if (birthdaysThisWeek.length > 0) {
        const names = birthdaysThisWeek.slice(0, 2).map(c => c.name.split(" ")[0]).join(", ");
        const extra = birthdaysThisWeek.length > 2 ? ` e +${birthdaysThisWeek.length - 2}` : "";
        alerts.push({
          type: "birthday_alert",
          severity: "info",
          title: "Aniversários esta semana",
          message: `${names}${extra}`,
          link: "/clients",
          entityId: null,
        });
      }
    }

    res.json({ alerts, total: alerts.length });
  } catch (err) {
    req.log.error({ err }, "Error fetching notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
