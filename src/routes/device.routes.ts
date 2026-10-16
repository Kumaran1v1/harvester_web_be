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

export default router;
