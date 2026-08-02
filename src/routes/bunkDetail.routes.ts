import { Router } from "express";
import prisma from "../config/db";
import { authenticateJWT } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/bunk-details
router.get("/bunk-details", authenticateJWT, async (req, res, next) => {
  try {
    const bunkDetails = await prisma.bunkDetail.findMany({
      orderBy: [
        { date: "desc" },
        { createdAt: "desc" }
      ]
    });
    res.json(bunkDetails);
  } catch (err) {
    next(err);
  }
});

// POST /api/bunk-details (Upsert by Date — 1 record per date)
router.post("/bunk-details", authenticateJWT, async (req, res, next) => {
  try {
    const { date, fuelAmount, paidAmount, balance, paymentStatus, purchasesJson, paymentsJson, remarks } = req.body;
    const targetDate = date ? new Date(date) : new Date();

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await prisma.bunkDetail.findFirst({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    if (existing) {
      const updated = await prisma.bunkDetail.update({
        where: { id: existing.id },
        data: {
          fuelAmount: parseFloat(fuelAmount || 0),
          paidAmount: parseFloat(paidAmount || 0),
          balance: parseFloat(balance || 0),
          paymentStatus: paymentStatus || (parseFloat(balance || 0) <= 0 ? "PAID" : "PENDING"),
          purchasesJson: purchasesJson ? (typeof purchasesJson === "string" ? purchasesJson : JSON.stringify(purchasesJson)) : null,
          paymentsJson: paymentsJson ? (typeof paymentsJson === "string" ? paymentsJson : JSON.stringify(paymentsJson)) : null,
          remarks: remarks || null
        }
      });
      return res.json(updated);
    }

    const bunkDetail = await prisma.bunkDetail.create({
      data: {
        date: targetDate,
        fuelAmount: parseFloat(fuelAmount || 0),
        paidAmount: parseFloat(paidAmount || 0),
        balance: parseFloat(balance || 0),
        paymentStatus: paymentStatus || (parseFloat(balance || 0) <= 0 ? "PAID" : "PENDING"),
        purchasesJson: purchasesJson ? (typeof purchasesJson === "string" ? purchasesJson : JSON.stringify(purchasesJson)) : null,
        paymentsJson: paymentsJson ? (typeof paymentsJson === "string" ? paymentsJson : JSON.stringify(paymentsJson)) : null,
        remarks: remarks || null
      }
    });
    res.status(201).json(bunkDetail);
  } catch (err) {
    next(err);
  }
});

// PUT /api/bunk-details/:id
router.put("/bunk-details/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { date, fuelAmount, paidAmount, balance, paymentStatus, purchasesJson, paymentsJson, remarks } = req.body;
    const updated = await prisma.bunkDetail.update({
      where: { id },
      data: {
        ...(date && { date: new Date(date) }),
        ...(fuelAmount !== undefined && { fuelAmount: parseFloat(fuelAmount) }),
        ...(paidAmount !== undefined && { paidAmount: parseFloat(paidAmount) }),
        ...(balance !== undefined && { balance: parseFloat(balance) }),
        ...(paymentStatus && { paymentStatus }),
        ...(purchasesJson !== undefined && { purchasesJson: typeof purchasesJson === "string" ? purchasesJson : JSON.stringify(purchasesJson) }),
        ...(paymentsJson !== undefined && { paymentsJson: typeof paymentsJson === "string" ? paymentsJson : JSON.stringify(paymentsJson) }),
        ...(remarks !== undefined && { remarks })
      }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bunk-details/:id
router.delete("/bunk-details/:id", authenticateJWT, async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.bunkDetail.delete({
      where: { id }
    });
    res.json({ success: true, message: `Bunk detail ${id} deleted successfully` });
  } catch (err) {
    next(err);
  }
});

export default router;
