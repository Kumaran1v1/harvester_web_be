import cron from "node-cron";
import prisma from "../config/db";
import { NotificationService } from "./notification.service";

export const defaultNotificationSchedules = [
  {
    code: "GOOD_MORNING",
    title: "🌅 Good Morning!",
    message: "Have a great and productive day ahead.",
    targetTime: "06:00",
    category: "GREETING",
    targetScreen: "DashboardTab",
  },
  {
    code: "BREAKFAST_REMINDER",
    title: "🍳 Breakfast Time!",
    message: "Have a healthy and nutritious breakfast to fuel your day.",
    targetTime: "09:00",
    category: "HEALTHY_HABIT",
    targetScreen: "DashboardTab",
  },
  {
    code: "HEALTHY_SNACK",
    title: "☕ Tea & Snack Break!",
    message: "Time for a healthy snack. Stay hydrated and keep your energy high.",
    targetTime: "11:00",
    category: "HEALTHY_HABIT",
    targetScreen: "DashboardTab",
  },
  {
    code: "LUNCH_REMINDER",
    title: "🍛 Lunch Time!",
    message: "Enjoy a healthy and balanced meal. Take a well-deserved break!",
    targetTime: "13:00",
    category: "HEALTHY_HABIT",
    targetScreen: "DashboardTab",
  },
  {
    code: "EVENING_SNACK",
    title: "🍎 Evening Snack Time!",
    message: "Recharge with a healthy snack to power through the rest of the day.",
    targetTime: "17:00",
    category: "HEALTHY_HABIT",
    targetScreen: "DashboardTab",
  },
  {
    code: "ATTENDANCE_REMINDER",
    title: "⚠️ Attendance Reminder",
    message: "Your attendance for today has not been updated. Please record it now.",
    targetTime: "18:00",
    category: "ACTION_REQUIRED",
    targetScreen: "OperatorsTab",
  },
  {
    code: "DINNER_REMINDER",
    title: "🍽️ Dinner Time!",
    message: "Time for a light and healthy dinner with family.",
    targetTime: "20:30",
    category: "HEALTHY_HABIT",
    targetScreen: "DashboardTab",
  },
  {
    code: "GOOD_NIGHT",
    title: "🌙 Good Night!",
    message: "Workday complete. Have a restful sleep and see you tomorrow!",
    targetTime: "21:00",
    category: "GREETING",
    targetScreen: "DashboardTab",
  },
];

/**
 * Helper to get current time and date in Asia/Kolkata
 */
export function getKolkataTimeAndDate(): { currentTime: string; currentDate: string } {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return {
    currentTime: timeFormatter.format(now), // "HH:mm"
    currentDate: dateFormatter.format(now), // "YYYY-MM-DD"
  };
}

/**
 * Seed default schedules into notification_master if empty
 */
export async function seedNotificationMaster() {
  try {
    for (const schedule of defaultNotificationSchedules) {
      await prisma.notificationMaster.upsert({
        where: { code: schedule.code },
        update: {},
        create: {
          code: schedule.code,
          title: schedule.title,
          message: schedule.message,
          targetTime: schedule.targetTime,
          category: schedule.category,
          targetScreen: schedule.targetScreen,
          isActive: true,
        },
      });
    }
    console.log("[Scheduler] Notification master initialized with 8 daily schedules.");
  } catch (error) {
    console.error("[Scheduler] Error seeding notification master:", error);
  }
}

/**
 * Start the minute-by-minute notification scheduler in Asia/Kolkata
 */
export function startNotificationScheduler() {
  // Seed master records
  seedNotificationMaster();

  // Run every minute: "* * * * *"
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        const { currentTime, currentDate } = getKolkataTimeAndDate();

        // 1. Check if any notification is scheduled for this minute
        const pendingSchedules = await prisma.notificationMaster.findMany({
          where: {
            targetTime: currentTime,
            isActive: true,
          },
        });

        if (!pendingSchedules.length) {
          return;
        }

        console.log(`[Scheduler] ${currentTime} IST: Triggering ${pendingSchedules.length} scheduled notification(s)`);

        for (const schedule of pendingSchedules) {
          if (schedule.code === "ATTENDANCE_REMINDER") {
            // Conditional: check operators who haven't marked attendance today
            await handleAttendanceReminder(schedule, currentDate);
          } else {
            // General: broadcast to all active users with active devices
            await handleGeneralScheduledNotification(schedule, currentDate);
          }
        }
      } catch (error) {
        console.error("[Scheduler] Error running notification cron:", error);
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log("[Scheduler] Automated Notification Scheduler active (Timezone: Asia/Kolkata).");
}

/**
 * Handle 6:00 PM (or configured time) conditional attendance reminder
 */
async function handleAttendanceReminder(schedule: any, currentDate: string) {
  // 1. Get today's start and end date in UTC corresponding to IST today
  const startOfDay = new Date(`${currentDate}T00:00:00.000+05:30`);
  const endOfDay = new Date(`${currentDate}T23:59:59.999+05:30`);

  // 2. Fetch all registered operators
  const allOperators = await prisma.operator.findMany({
    select: { id: true, operatorName: true },
  });

  // 3. Fetch attendance records entered today
  const todayAttendances = await prisma.operatorAttendance.findMany({
    where: {
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: { operatorId: true },
  });

  const attendedOperatorIds = new Set(todayAttendances.map(a => a.operatorId));
  const missingAttendanceOperators = allOperators.filter(op => !attendedOperatorIds.has(op.id));

  console.log(
    `[Scheduler] Attendance check: ${missingAttendanceOperators.length} of ${allOperators.length} operators have not marked attendance today.`
  );

  if (!missingAttendanceOperators.length) {
    return;
  }

  // 4. Send reminder to operators (or users managing them)
  // Check users who have devices
  const usersWithDevices = await prisma.userDevice.findMany({
    where: { isActive: true },
    select: { userId: true },
    distinct: ["userId"],
  });

  for (const { userId } of usersWithDevices) {
    await NotificationService.sendNotificationWithLog({
      userId,
      notificationCode: schedule.code,
      notificationDate: currentDate,
      title: schedule.title,
      body: schedule.message,
      data: {
        type: schedule.code,
        screen: schedule.targetScreen || "OperatorsTab",
      },
    });
  }
}

/**
 * Handle general scheduled notification (Good Morning, Snacks, Lunch, Dinner, Good Night)
 */
async function handleGeneralScheduledNotification(schedule: any, currentDate: string) {
  // Find all active users with registered devices
  const usersWithDevices = await prisma.userDevice.findMany({
    where: { isActive: true },
    select: { userId: true },
    distinct: ["userId"],
  });

  for (const { userId } of usersWithDevices) {
    await NotificationService.sendNotificationWithLog({
      userId,
      notificationCode: schedule.code,
      notificationDate: currentDate,
      title: schedule.title,
      body: schedule.message,
      data: {
        type: schedule.code,
        screen: schedule.targetScreen || "DashboardTab",
      },
    });
  }
}
