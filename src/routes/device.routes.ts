import { Router } from "express";
import prisma from "../config/db";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/authMiddleware";
import { NotificationService } from "../services/notification.service";

const router = Router();

/**
 * POST /api/device/register
 * Register or update device FCM token for authenticated user
 */
router.post("/register", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { deviceId, fcmToken, platform } = req.body || {};

    if (!deviceId || !fcmToken) {
      return res.status(400).json({ message: "deviceId and fcmToken are required" });
    }

    const device = await prisma.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId,
          deviceId,
        },
      },
      update: {
        fcmToken,
        platform: platform || "android",
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        deviceId,
        fcmToken,
        platform: platform || "android",
        isActive: true,
      },
    });

    console.log(`[Device] Registered device ${deviceId} for user ${userId}`);

    return res.json({
      success: true,
      message: "Device registered successfully",
      device,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/device/unregister
 * Deactivate a device on logout
 */
router.post("/unregister", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    const { deviceId } = req.body || {};

    if (userId && deviceId) {
      await prisma.userDevice.updateMany({
        where: { userId, deviceId },
        data: { isActive: false },
      });
    }

    return res.json({ success: true, message: "Device unregistered successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/device/test-push
 * Trigger an immediate test push to current user's devices
 */
router.post("/test-push", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { title, body } = req.body || {};

    const result = await NotificationService.sendToUser(userId, {
      title: title || "🔔 Harvester Test Notification",
      body: body || "Your Harvester backend is successfully connected to push notifications!",
      data: {
        type: "SYSTEM_ALERT",
        screen: "DashboardTab",
      },
    });

    return res.json({
      success: true,
      message: `Test notification sent: ${result.sent} successful, ${result.failed} failed`,
      result,
    });
  } catch (error) {
    next(error);
  }
});

import {
  triggerSingleSchedule,
  checkAndDispatchScheduledNotifications,
  getKolkataTimeAndDate,
} from "../services/scheduler.service";

/**
 * GET /api/device/schedules
 * List all configured notification schedules and current server Kolkata time
 */
router.get("/schedules", authenticateJWT, async (_req, res, next) => {
  try {
    const { currentTime, currentDate } = getKolkataTimeAndDate();
    const schedules = await prisma.notificationMaster.findMany({
      orderBy: { targetTime: "asc" },
    });
    return res.json({
      success: true,
      serverTime: currentTime,
      serverDate: currentDate,
      schedules,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/device/schedules
 * Create a new notification schedule
 */
router.post("/schedules", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { code, title, message, targetTime, category, targetScreen, isActive } = req.body || {};
    if (!code || !title || !message || !targetTime) {
      return res.status(400).json({ message: "Code, title, message, and targetTime (HH:mm) are required" });
    }

    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, "_");

    const existing = await prisma.notificationMaster.findUnique({
      where: { code: cleanCode },
    });
    if (existing) {
      return res.status(400).json({ message: `Schedule code '${cleanCode}' already exists` });
    }

    const schedule = await prisma.notificationMaster.create({
      data: {
        code: cleanCode,
        title: title.trim(),
        message: message.trim(),
        targetTime: targetTime.trim(),
        category: category ? category.trim() : "GENERAL",
        targetScreen: targetScreen ? targetScreen.trim() : "DashboardTab",
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Notification schedule created successfully",
      schedule,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/device/schedules/:id
 * Update an existing notification schedule by ID
 */
router.put("/schedules/:id", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const { title, message, targetTime, category, targetScreen, isActive } = req.body || {};

    const updated = await prisma.notificationMaster.update({
      where: { id },
      data: {
        ...(title ? { title: title.trim() } : {}),
        ...(message ? { message: message.trim() } : {}),
        ...(targetTime ? { targetTime: targetTime.trim() } : {}),
        ...(category ? { category: category.trim() } : {}),
        ...(targetScreen ? { targetScreen: targetScreen.trim() } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return res.json({
      success: true,
      message: "Notification schedule updated successfully",
      schedule: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/device/schedules/:id
 * Delete a notification schedule by ID
 */
router.delete("/schedules/:id", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    await prisma.notificationMaster.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: "Notification schedule deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/device/schedules/:code
 * Update target time or active state of a schedule by code
 */
router.patch("/schedules/:code", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { code } = req.params;
    const { targetTime, isActive, title, message, category, targetScreen } = req.body || {};

    const updated = await prisma.notificationMaster.update({
      where: { code },
      data: {
        ...(targetTime ? { targetTime: targetTime.trim() } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(title ? { title: title.trim() } : {}),
        ...(message ? { message: message.trim() } : {}),
        ...(category ? { category: category.trim() } : {}),
        ...(targetScreen ? { targetScreen: targetScreen.trim() } : {}),
      },
    });

    return res.json({
      success: true,
      message: `Schedule ${code} updated successfully`,
      schedule: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/device/schedules/trigger/:code
 * Force trigger a specific scheduled notification immediately (bypassing time & daily deduplication)
 */
router.post("/schedules/trigger/:code", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { code } = req.params;
    const result = await triggerSingleSchedule(code, true);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/device/schedules/check
 * Explicitly run the scheduler check for current time (can be invoked by external cron pingers)
 */
router.get("/schedules/check", async (_req, res, next) => {
  try {
    const result = await checkAndDispatchScheduledNotifications();
    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
