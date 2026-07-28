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

// GET /api/class-bills
router.get("/class-bills", authenticateJWT, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string || "").trim();

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { place: { contains: search } },
        { customerName: { contains: search } },
        { contactNumber: { contains: search } },
        { remarks: { contains: search } }
      ];
    }

    const [bills, total] = await Promise.all([
      prisma.classBill.findMany({
        where: whereClause,
        orderBy: { date: "desc" },
        skip: page * limit,
        take: limit
      }),
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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

    const [updatedBill] = await prisma.$transaction([
      prisma.classBill.update({
        where: { id },
        data: {
          balance: newBalance,
          advance: newAdvance,
          status: newStatus
        }
      }),
      prisma.classBillPayment.create({
        data: {
          billId: id,
          amount: paymentAmount,
          remarks: remarks || "Partial Payment"
        }
      })
    ]);

    res.status(201).json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/class-bills/:id/payments/:paymentId
router.delete("/class-bills/:id/payments/:paymentId", authenticateJWT, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);

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

    const [updatedBill] = await prisma.$transaction([
      prisma.classBill.update({
        where: { id },
        data: {
          balance: newBalance,
          advance: newAdvance,
          status: newStatus
        }
      }),
      prisma.classBillPayment.delete({
        where: { id: paymentId }
      })
    ]);

    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/class-bills/:id/status
router.patch("/class-bills/:id/status", authenticateJWT, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
    await prisma.classBill.delete({
      where: { id }
    });
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
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string || "").trim();

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { place: { contains: search } },
        { customerName: { contains: search } },
        { contactNumber: { contains: search } },
        { remarks: { contains: search } }
      ];
    }

    const [bills, total] = await Promise.all([
      prisma.kartarBill.findMany({
        where: whereClause,
        orderBy: { date: "desc" },
        skip: page * limit,
        take: limit
      }),
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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

    const [updatedBill] = await prisma.$transaction([
      prisma.kartarBill.update({
        where: { id },
        data: {
          balance: newBalance,
          advance: newAdvance,
          status: newStatus
        }
      }),
      prisma.kartarBillPayment.create({
        data: {
          billId: id,
          amount: paymentAmount,
          remarks: remarks || "Partial Payment"
        }
      })
    ]);

    res.status(201).json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/kartar-bills/:id/payments/:paymentId
router.delete("/kartar-bills/:id/payments/:paymentId", authenticateJWT, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);

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

    const [updatedBill] = await prisma.$transaction([
      prisma.kartarBill.update({
        where: { id },
        data: {
          balance: newBalance,
          advance: newAdvance,
          status: newStatus
        }
      }),
      prisma.kartarBillPayment.delete({
        where: { id: paymentId }
      })
    ]);

    res.json(updatedBill);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/kartar-bills/:id/status
router.patch("/kartar-bills/:id/status", authenticateJWT, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
    await prisma.kartarBill.delete({
      where: { id }
    });
    res.json({ success: true, message: `Bill ${id} deleted successfully` });
  } catch (err) {
    next(err);
  }
});

export default router;
