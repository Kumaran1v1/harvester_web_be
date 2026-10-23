import prisma from "../config/db";
import { getFirebaseMessaging } from "../config/firebase";

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class NotificationService {
  /**
   * Send notification to all active devices registered to a specific user
   */
  static async sendToUser(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<{ sent: number; failed: number }> {
    const devices = await prisma.userDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    if (!devices.length) {
      return { sent: 0, failed: 0 };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.log(`[Notification] Firebase messaging not initialized. Simulated push to user ${userId}: "${payload.title}"`);
      return { sent: devices.length, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const device of devices) {
      try {
        await messaging.send({
          token: device.fcmToken,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data || {},
          android: {
            priority: "high",
            notification: {
              channelId: "harvester_notifications",
              sound: "default",
              priority: "high",
            },
          },
        });
        sent++;
      } catch (error: any) {
        failed++;
        console.error(`[Notification] Failed to send push to device ${device.id}:`, error?.message || error);

        // Deactivate invalid or unregistered tokens
        const errorCode = error?.code || error?.errorInfo?.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          console.log(`[Notification] Deactivating invalid token for device ${device.id}`);
          await prisma.userDevice.update({
            where: { id: device.id },
            data: { isActive: false },
          });
        }
      }
    }

    return { sent, failed };
  }

  /**
   * Send a scheduled notification with deduplication logging
   */
  static async sendNotificationWithLog(params: {
    userId: string;
    notificationCode: string;
    notificationDate: string; // YYYY-MM-DD
    title: string;
    body: string;
    data?: Record<string, string>;
    force?: boolean;
  }): Promise<boolean> {
    const { userId, notificationCode, notificationDate, title, body, data, force } = params;

    if (!force) {
      // Check deduplication
      const existingLog = await prisma.notificationLog.findFirst({
        where: {
          userId,
          notificationCode,
          notificationDate,
        },
      });

      if (existingLog) {
        // Already sent today
        return false;
      }
    }

    // Send push
    const result = await this.sendToUser(userId, { title, body, data });
    const status = result.sent > 0 ? "SENT" : result.failed > 0 ? "FAILED" : "NO_DEVICE";

    // Record or update log
    try {
      await prisma.notificationLog.upsert({
        where: {
          userId_notificationCode_notificationDate: {
            userId,
            notificationCode,
            notificationDate,
          },
        },
        update: {
          status,
          sentAt: new Date(),
        },
        create: {
          userId,
          notificationCode,
          notificationDate,
          status,
        },
      });
    } catch (logErr) {
      // Ignore unique constraint race conditions
    }

    return result.sent > 0;
  }
}
