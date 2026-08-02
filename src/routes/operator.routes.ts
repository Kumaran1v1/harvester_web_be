import { Router } from "express";
import prisma from "../config/db";
import { authenticateJWT } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/operators (Get summary with calculated attendance-based wages)
router.get("/operators", authenticateJWT, async (req, res, next) => {
  try {
    const search = (req.query.search as string || "").trim();
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { operatorName: { contains: search } },
        { mobile: { contains: search } }
      ];
    }

    const operators = await prisma.operator.findMany({
      where: whereClause,
      include: {
        attendances: {
          orderBy: { date: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const computed = operators.map(op => {
      const presentDays = op.attendances.filter(a => a.status === "PRESENT").length;
      const absentDays  = op.attendances.filter(a => a.status === "ABSENT").length;

      // Each attendance's dailyWage = salary PAID to operator that day
      const totalSalaryPaid = op.attendances.reduce((sum, att) => {
        return sum + (att.dailyWage !== null && att.dailyWage !== undefined ? Number(att.dailyWage) : 0);
      }, 0);

      return {
        id: op.id,
        operatorName: op.operatorName,
        mobile: op.mobile,
        presentDays,
        absentDays,
        totalSalaryPaid,
        // keep legacy fields for compatibility
        earnedSalary: totalSalaryPaid,
        totalPaid: totalSalaryPaid,
        balance: 0,
        attendances: op.attendances.map(a => ({
          id: a.id,
          date: a.date,
          status: a.status,
          dailyWage: a.dailyWage !== null ? Number(a.dailyWage) : null
        })),
        createdAt: op.createdAt
      };
    });

    res.json(computed);
  } catch (err) {
    next(err);
  }
});


// POST /api/operators
router.post("/operators", authenticateJWT, async (req, res, next) => {
  try {
    const { operatorName, mobile, salary } = req.body;
    const operator = await prisma.operator.create({
      data: {
        operatorName,
        mobile,
        salary: salary ? parseFloat(salary) : 0  // salary is optional; daily wage entered per attendance day
      }
    });
    res.status(201).json(operator);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/operators/:id
router.delete("/operators/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.operator.delete({
      where: { id }
    });
    res.json({ success: true, message: `Operator ${id} deleted successfully` });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/operators/:id (Update operator name and mobile)
router.patch("/operators/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { operatorName, mobile } = req.body;
    const updated = await prisma.operator.update({
      where: { id },
      data: {
        ...(operatorName && { operatorName }),
        ...(mobile && { mobile })
      }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// OPERATOR ATTENDANCE ROUTES
// ==========================================

// GET /api/operators/attendance (Paginated logs list)
router.get("/operators/attendance", authenticateJWT, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string || "").trim();

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { status: { contains: search } },
        {
          operator: {
            OR: [
              { operatorName: { contains: search } },
              { mobile: { contains: search } }
            ]
          }
        }
      ];
    }

    const [attendances, total] = await Promise.all([
      prisma.operatorAttendance.findMany({
        where: whereClause,
        include: { operator: true },
        orderBy: { date: "desc" },
        skip: page * limit,
        take: limit
      }),
      prisma.operatorAttendance.count({ where: whereClause })
    ]);

    res.json({ data: attendances, total });
  } catch (err) {
    next(err);
  }
});

// POST /api/operators/attendance (Upsert attendance and farmer name)
router.post("/operators/attendance", authenticateJWT, async (req, res, next) => {
  try {
    const { operatorId, date, status, dailyWage } = req.body;
    const opId = String(operatorId);
    const logDate = date ? new Date(date) : new Date();

    const startOfDay = new Date(logDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(logDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await prisma.operatorAttendance.findFirst({
      where: {
        operatorId: opId,
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    if (status === "UNMARKED") {
      if (existing) {
        await prisma.operatorAttendance.delete({
          where: { id: existing.id }
        });
      }
      return res.json({ success: true, message: "Attendance cleared successfully" });
    }

    const wageVal = dailyWage ? parseFloat(dailyWage) : null;

    let attendance;
    if (existing) {
      attendance = await prisma.operatorAttendance.update({
        where: { id: existing.id },
        data: {
          status,
          dailyWage: wageVal
        },
        include: { operator: true }
      });
    } else {
      attendance = await prisma.operatorAttendance.create({
        data: {
          operatorId: opId,
          date: startOfDay,
          status,
          dailyWage: wageVal
        },
        include: { operator: true }
      });
    }

    res.status(201).json(attendance);
  } catch (err) {
    next(err);
  }
});

// GET /api/operators/attendance-grid (Retrieve date range or 7-day visual grid inputs)
router.get("/operators/attendance-grid", authenticateJWT, async (req, res, next) => {
  try {
    const startDateStr = req.query.startDate as string;
    const endDateStr = req.query.endDate as string;

    let startDate = new Date();
    if (startDateStr) {
      startDate = new Date(startDateStr);
    } else {
      startDate.setDate(startDate.getDate() - 6);
    }
    startDate.setHours(0, 0, 0, 0);

    let endDate = new Date(startDate);
    if (endDateStr) {
      endDate = new Date(endDateStr);
    } else {
      endDate.setDate(endDate.getDate() + 6);
    }
    endDate.setHours(23, 59, 59, 999);

    const [operators, attendances] = await Promise.all([
      prisma.operator.findMany({
        orderBy: { createdAt: "desc" }
      }),
      prisma.operatorAttendance.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { date: "asc" }
      })
    ]);

    res.json({
      operators: operators.map(op => ({
        id: op.id,
        operatorName: op.operatorName,
        mobile: op.mobile,
        dailyWage: Number(op.salary),  // map salary -> dailyWage for frontend
        createdAt: op.createdAt
      })),
      attendances
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/operators/attendance/:id
router.delete("/operators/attendance/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.operatorAttendance.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// OPERATOR SALARY PAYMENT ROUTES
// ==========================================

// GET /api/operators/:id/payments (Retrieve payments history for single operator)
router.get("/operators/:id/payments", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const payments = await prisma.operatorSalaryPayment.findMany({
      where: { operatorId: id },
      orderBy: { paymentDate: "desc" }
    });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// POST /api/operators/salary
router.post("/operators/salary", authenticateJWT, async (req, res, next) => {
  try {
    const { operatorId, amount, paymentDate, remarks } = req.body;
    const payment = await prisma.operatorSalaryPayment.create({
      data: {
        operatorId: String(operatorId),
        amount: parseFloat(amount),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        remarks
      }
    });
    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/operators/salary/:id
router.delete("/operators/salary/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.operatorSalaryPayment.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
