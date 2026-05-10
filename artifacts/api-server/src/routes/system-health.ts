import { Router } from "express";
import { requireAuth } from "../lib/tenant";
import { getRedisStatus } from "../lib/redis";
import { ROLES } from "@workspace/permissions";

const router = Router();

router.get("/admin/system-health", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) {
      res.status(403).json({ error: "Forbidden: superadmin only" });
      return;
    }

    const redisStatus = getRedisStatus();

    res.json({
      redis: {
        status: redisStatus,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching system health");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
