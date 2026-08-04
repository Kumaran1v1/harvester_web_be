import { Router } from "express";
import prisma from "../config/db";
import { authenticateJWT } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/pending-bills
router.get("/pending-bills", authenticateJWT, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    const limitQuery = req.query.limit as string;
    const search = (req.query.search as string || "").trim();

    // Check if pagination should be bypassed for exports
    const isAll = limitQuery === "all" || limitQuery === "-1";
    const limit = isAll ? 0 : (parseInt(limitQuery) || 10);

    // Search where clauses
    const classWhereClause: any = { status: 0 }; // 0 = PENDING
    if (search) {
      classWhereClause.OR = [
        { place: { contains: search } },
        { customerName: { contains: search } },
        { contactNumber: { contains: search } },
        { remarks: { contains: search } }
      ];
    }

    const kartarWhereClause: any = { status: 0 }; // 0 = PENDING
    if (search) {
      kartarWhereClause.OR = [
        { place: { contains: search } },
        { customerName: { contains: search } },
        { contactNumber: { contains: search } },
        { remarks: { contains: search } }
      ];
    }

    const [classBills, kartarBills] = await Promise.all([
      prisma.classBill.findMany({ where: classWhereClause }),
      prisma.kartarBill.findMany({ where: kartarWhereClause })
    ]);

    // Format and combine
    const combined = [
      ...classBills.map(b => ({
        id: `class-${b.id}`,
        dbId: b.id,
        date: b.date,
        place: b.place,
        customerName: b.customerName,
        contactNumber: b.contactNumber,
        timeHours: Number(b.timeHours),
        totalAmount: Number(b.totalAmount),
        advance: Number(b.advance),
        balanceAmount: Number(b.balance),
        remarks: b.remarks,
        machineType: "CLASS"
      })),
      ...kartarBills.map(b => ({
        id: `kartar-${b.id}`,
        dbId: b.id,
        date: b.date,
        place: b.place,
        customerName: b.customerName,
        contactNumber: b.contactNumber,
        timeHours: Number(b.timeHours),
        totalAmount: Number(b.totalAmount),
        advance: Number(b.advance),
        balanceAmount: Number(b.balance),
        remarks: b.remarks,
        machineType: "KARTAR"
      }))
    ];

    // Sort by Date Ascending
    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const total = combined.length;
    const paginated = isAll ? combined : combined.slice(page * limit, (page + 1) * limit);

    res.json({
      data: paginated,
      total
    });
  } catch (err) {
    next(err);
  }
});

export default router;
