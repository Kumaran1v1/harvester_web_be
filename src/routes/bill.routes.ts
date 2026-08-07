import { Router } from "express";
import prisma from "../config/db";
import { authenticateJWT } from "../middlewares/authMiddleware";

const router = Router();

// Helper to validate date is not in future
const isFutureDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const now = new Date();
  // Clear times for date comparison
  const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return compareDate > today;
};

// ==========================================
// 1. CLASS MACHINE BILLS ENDPOINTS
// ==========================================

// Helper to build where clause with search and month filtering
const buildBillWhereClause = (reqQuery: any) => {
  const search = (reqQuery.search as string || "").trim();
  const monthQuery = reqQuery.month as string;
  const yearQuery = reqQuery.year as string;

  const conditions: any[] = [];

  if (search) {
    conditions.push({
      OR: [
        { place: { contains: search } },
        { customerName: { contains: search } },
        { contactNumber: { contains: search } },
        { remarks: { contains: search } }
      ]
    });
  }

  if (monthQuery && yearQuery && monthQuery.toLowerCase() !== "all" && monthQuery !== "0") {
    const year = parseInt(yearQuery);
    const month = parseInt(monthQuery) - 1; // 0-indexed
    if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
      // Start of month (e.g. 2026-08-01 00:00:00 UTC and Local)
      const startDateLocal = new Date(year, month, 1, 0, 0, 0, 0);
      const endDateLocal = new Date(year, month + 1, 0, 23, 59, 59, 999);

      const startDateUTC = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const endDateUTC = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

      const minStart = startDateLocal < startDateUTC ? startDateLocal : startDateUTC;
      const maxEnd = endDateLocal > endDateUTC ? endDateLocal : endDateUTC;

      conditions.push({
        OR: [
          { date: { gte: minStart, lte: maxEnd } },
          { createdAt: { gte: minStart, lte: maxEnd } }
        ]
      });
    }
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
};

// GET /api/class-bills
router.get("/class-bills", authenticateJWT, async (req, res, next) => {
  try {
    const limitParam = req.query.limit as string;
    const isAll = limitParam === "all";
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(limitParam) || 10;

    const whereClause = buildBillWhereClause(req.query);

    const queryOptions: any = {
      where: whereClause,
      orderBy: { date: "asc" }
    };

    if (!isAll) {
      queryOptions.skip = page * limit;
      queryOptions.take = limit;
    }

    const [bills, total] = await Promise.all([
      prisma.classBill.findMany(queryOptions),
      prisma.classBill.count({ where: whereClause })
    ]);

    res.json({
      data: bills,
      total
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/class-bills
router.post("/class-bills", authenticateJWT, async (req, res, next) => {
  try {
    const { date, place, customerName, contactNumber, timeHours, totalAmount, advance, remarks } = req.body;
    
    if (date && isFutureDate(date)) {
      return res.status(400).json({ message: "Bill date cannot be in the future." });
    }

    const computedBalance = parseFloat(totalAmount) - parseFloat(advance);

    const bill = await prisma.classBill.create({
      data: {
        date: date ? new Date(date) : new Date(),
        place,
        customerName,
        contactNumber,
        timeHours: parseFloat(timeHours),
        totalAmount: parseFloat(totalAmount),
        advance: parseFloat(advance),
        balance: computedBalance,
        remarks,
        status: 0 // Default: 0 = PENDING
      }
    });

    if (parseFloat(advance) > 0) {
      await prisma.classBillPayment.create({
        data: {
          billId: bill.id,
          amount: parseFloat(advance),
          remarks: "Initial Advance"
        }
      });
    }

    res.status(201).json(bill);
  } catch (err) {
    next(err);
  }
});

// PUT /api/class-bills/:id
router.put("/class-bills/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { date, place, customerName, contactNumber, timeHours, totalAmount, advance, remarks, status } = req.body;

    if (date && isFutureDate(date)) {
      return res.status(400).json({ message: "Bill date cannot be in the future." });
    }

    const existing = await prisma.classBill.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const finalTotalAmount = totalAmount !== undefined ? parseFloat(totalAmount) : Number(existing.totalAmount);
    const finalAdvance = advance !== undefined ? parseFloat(advance) : Number(existing.advance);
    const computedBalance = finalTotalAmount - finalAdvance;

    if (advance !== undefined && parseFloat(advance) !== Number(existing.advance)) {
      const newAdvanceVal = parseFloat(advance);
      const initialPayment = await prisma.classBillPayment.findFirst({
        where: { billId: id, remarks: "Initial Advance" }
      });

      if (initialPayment) {
        await prisma.classBillPayment.update({
          where: { id: initialPayment.id },
          data: { amount: newAdvanceVal }
        });
      } else if (newAdvanceVal > 0) {
        await prisma.classBillPayment.create({
          data: {
            billId: id,
            amount: newAdvanceVal,
            remarks: "Initial Advance"
          }
        });
      }
    }

    const updatedBill = await prisma.classBill.update({
      where: { id },
      data: {
        date: date ? new Date(date) : undefined,
        place,
        customerName,
        contactNumber,
        timeHours: timeHours !== undefined ? parseFloat(timeHours) : undefined,
        totalAmount: totalAmount !== undefined ? parseFloat(totalAmount) : undefined,
        advance: advance !== undefined ? parseFloat(advance) : undefined,
        balance: computedBalance,
        remarks,
        status: status !== undefined ? parseInt(status) : undefined
      }
    });
    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// GET /api/class-bills/:id/payments
router.get("/class-bills/:id/payments", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const payments = await prisma.classBillPayment.findMany({
      where: { billId: id },
      orderBy: { paymentDate: "desc" }
    });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// POST /api/class-bills/:id/payments
router.post("/class-bills/:id/payments", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { amount, remarks } = req.body;

    const bill = await prisma.classBill.findUnique({ where: { id } });
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const newBalance = Number(bill.balance) - paymentAmount;
    const newAdvance = Number(bill.advance) + paymentAmount;
    const newStatus = newBalance === 0 ? 1 : bill.status;

    const updatedBill = await prisma.classBill.update({
      where: { id },
      data: {
        balance: newBalance,
        advance: newAdvance,
        status: newStatus
      }
    });
    await prisma.classBillPayment.create({
      data: {
        billId: id,
        amount: paymentAmount,
        remarks: remarks || "Partial Payment"
      }
    });

    res.status(201).json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/class-bills/:id/payments/:paymentId
router.delete("/class-bills/:id/payments/:paymentId", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const paymentId = req.params.paymentId;

    const payment = await prisma.classBillPayment.findFirst({
      where: { id: paymentId, billId: id }
    });
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    const bill = await prisma.classBill.findUnique({ where: { id } });
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const paymentAmount = Number(payment.amount);
    const newBalance = Number(bill.balance) + paymentAmount;
    const newAdvance = Number(bill.advance) - paymentAmount;
    const newStatus = newBalance === 0 ? 1 : 0;

    await prisma.classBillPayment.delete({
      where: { id: paymentId }
    });
    const updatedBill = await prisma.classBill.update({
      where: { id },
      data: {
        balance: newBalance,
        advance: newAdvance,
        status: newStatus
      }
    });

    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/class-bills/:id/status
router.patch("/class-bills/:id/status", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (status !== 0 && status !== 1) {
      return res.status(400).json({ message: "Invalid status value. Must be 0 or 1." });
    }

    const updatedBill = await prisma.classBill.update({
      where: { id },
      data: {
        status: parseInt(status)
      }
    });
    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/class-bills/:id
router.delete("/class-bills/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.$transaction([
      prisma.classBillPayment.deleteMany({
        where: { billId: id }
      }),
      prisma.classBill.delete({
        where: { id }
      })
    ]);
    res.json({ success: true, message: `Bill ${id} deleted successfully` });
  } catch (err) {
    next(err);
  }
});


// ==========================================
// 2. KARTAR MACHINE BILLS ENDPOINTS
// ==========================================

// GET /api/kartar-bills
router.get("/kartar-bills", authenticateJWT, async (req, res, next) => {
  try {
    const limitParam = req.query.limit as string;
    const isAll = limitParam === "all";
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(limitParam) || 10;

    const whereClause = buildBillWhereClause(req.query);

    const queryOptions: any = {
      where: whereClause,
      orderBy: { date: "asc" }
    };

    if (!isAll) {
      queryOptions.skip = page * limit;
      queryOptions.take = limit;
    }

    const [bills, total] = await Promise.all([
      prisma.kartarBill.findMany(queryOptions),
      prisma.kartarBill.count({ where: whereClause })
    ]);

    res.json({
      data: bills,
      total
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/kartar-bills
router.post("/kartar-bills", authenticateJWT, async (req, res, next) => {
  try {
    const { date, place, customerName, contactNumber, timeHours, totalAmount, advance, remarks } = req.body;
    
    if (date && isFutureDate(date)) {
      return res.status(400).json({ message: "Bill date cannot be in the future." });
    }

    const computedBalance = parseFloat(totalAmount) - parseFloat(advance);

    const bill = await prisma.kartarBill.create({
      data: {
        date: date ? new Date(date) : new Date(),
        place,
        customerName,
        contactNumber,
        timeHours: parseFloat(timeHours),
        totalAmount: parseFloat(totalAmount),
        advance: parseFloat(advance),
        balance: computedBalance,
        remarks,
        status: 0 // Default: 0 = PENDING
      }
    });

    if (parseFloat(advance) > 0) {
      await prisma.kartarBillPayment.create({
        data: {
          billId: bill.id,
          amount: parseFloat(advance),
          remarks: "Initial Advance"
        }
      });
    }

    res.status(201).json(bill);
  } catch (err) {
    next(err);
  }
});

// PUT /api/kartar-bills/:id
router.put("/kartar-bills/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { date, place, customerName, contactNumber, timeHours, totalAmount, advance, remarks, status } = req.body;

    if (date && isFutureDate(date)) {
      return res.status(400).json({ message: "Bill date cannot be in the future." });
    }

    const existing = await prisma.kartarBill.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const finalTotalAmount = totalAmount !== undefined ? parseFloat(totalAmount) : Number(existing.totalAmount);
    const finalAdvance = advance !== undefined ? parseFloat(advance) : Number(existing.advance);
    const computedBalance = finalTotalAmount - finalAdvance;

    if (advance !== undefined && parseFloat(advance) !== Number(existing.advance)) {
      const newAdvanceVal = parseFloat(advance);
      const initialPayment = await prisma.kartarBillPayment.findFirst({
        where: { billId: id, remarks: "Initial Advance" }
      });

      if (initialPayment) {
        await prisma.kartarBillPayment.update({
          where: { id: initialPayment.id },
          data: { amount: newAdvanceVal }
        });
      } else if (newAdvanceVal > 0) {
        await prisma.kartarBillPayment.create({
          data: {
            billId: id,
            amount: newAdvanceVal,
            remarks: "Initial Advance"
          }
        });
      }
    }

    const updatedBill = await prisma.kartarBill.update({
      where: { id },
      data: {
        date: date ? new Date(date) : undefined,
        place,
        customerName,
        contactNumber,
        timeHours: timeHours !== undefined ? parseFloat(timeHours) : undefined,
        totalAmount: totalAmount !== undefined ? parseFloat(totalAmount) : undefined,
        advance: advance !== undefined ? parseFloat(advance) : undefined,
        balance: computedBalance,
        remarks,
        status: status !== undefined ? parseInt(status) : undefined
      }
    });
    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// GET /api/kartar-bills/:id/payments
router.get("/api/kartar-bills/:id/payments", authenticateJWT, async (req, res, next) => {
  // Wait, path parameter handling:
});

// GET /api/kartar-bills/:id/payments
router.get("/kartar-bills/:id/payments", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const payments = await prisma.kartarBillPayment.findMany({
      where: { billId: id },
      orderBy: { paymentDate: "desc" }
    });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// POST /api/kartar-bills/:id/payments
router.post("/kartar-bills/:id/payments", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { amount, remarks } = req.body;

    const bill = await prisma.kartarBill.findUnique({ where: { id } });
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const newBalance = Number(bill.balance) - paymentAmount;
    const newAdvance = Number(bill.advance) + paymentAmount;
    const newStatus = newBalance === 0 ? 1 : bill.status;

    const updatedBill = await prisma.kartarBill.update({
      where: { id },
      data: {
        balance: newBalance,
        advance: newAdvance,
        status: newStatus
      }
    });
    await prisma.kartarBillPayment.create({
      data: {
        billId: id,
        amount: paymentAmount,
        remarks: remarks || "Partial Payment"
      }
    });

    res.status(201).json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/kartar-bills/:id/payments/:paymentId
router.delete("/kartar-bills/:id/payments/:paymentId", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const paymentId = req.params.paymentId;

    const payment = await prisma.kartarBillPayment.findFirst({
      where: { id: paymentId, billId: id }
    });
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    const bill = await prisma.kartarBill.findUnique({ where: { id } });
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const paymentAmount = Number(payment.amount);
    const newBalance = Number(bill.balance) + paymentAmount;
    const newAdvance = Number(bill.advance) - paymentAmount;
    const newStatus = newBalance === 0 ? 1 : 0;

    await prisma.kartarBillPayment.delete({
      where: { id: paymentId }
    });
    const updatedBill = await prisma.kartarBill.update({
      where: { id },
      data: {
        balance: newBalance,
        advance: newAdvance,
        status: newStatus
      }
    });

    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/kartar-bills/:id/status
router.patch("/kartar-bills/:id/status", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (status !== 0 && status !== 1) {
      return res.status(400).json({ message: "Invalid status value. Must be 0 or 1." });
    }

    const updatedBill = await prisma.kartarBill.update({
      where: { id },
      data: {
        status: parseInt(status)
      }
    });
    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/kartar-bills/:id
router.delete("/kartar-bills/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.$transaction([
      prisma.kartarBillPayment.deleteMany({
        where: { billId: id }
      }),
      prisma.kartarBill.delete({
        where: { id }
      })
    ]);
    res.json({ success: true, message: `Bill ${id} deleted successfully` });
  } catch (err) {
    next(err);
  }
});

export default router;
