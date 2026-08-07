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

    const monthQuery = req.query.month as string;
    const yearQuery = req.query.year as string;

    let dateCondition: any = null;
    if (monthQuery && yearQuery && monthQuery.toLowerCase() !== "all" && monthQuery !== "0") {
      const year = parseInt(yearQuery);
      const month = parseInt(monthQuery) - 1;
      if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
        const startDateLocal = new Date(year, month, 1, 0, 0, 0, 0);
        const endDateLocal = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const startDateUTC = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const endDateUTC = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

        const minStart = startDateLocal < startDateUTC ? startDateLocal : startDateUTC;
        const maxEnd = endDateLocal > endDateUTC ? endDateLocal : endDateUTC;

        dateCondition = {
          OR: [
            { date: { gte: minStart, lte: maxEnd } },
            { createdAt: { gte: minStart, lte: maxEnd } }
          ]
        };
      }
    }

    // Search where clauses
    const classWhereClause: any = { status: 0 }; // 0 = PENDING
    const kartarWhereClause: any = { status: 0 }; // 0 = PENDING

    if (search || dateCondition) {
      const classConditions: any[] = [{ status: 0 }];
      const kartarConditions: any[] = [{ status: 0 }];

      if (dateCondition) {
        classConditions.push(dateCondition);
        kartarConditions.push(dateCondition);
      }

      if (search) {
        const searchOR = [
          { place: { contains: search } },
          { customerName: { contains: search } },
          { contactNumber: { contains: search } },
          { remarks: { contains: search } }
        ];
        classConditions.push({ OR: searchOR });
        kartarConditions.push({ OR: searchOR });
      }

      classWhereClause.AND = classConditions;
      kartarWhereClause.AND = kartarConditions;
      delete classWhereClause.status;
      delete kartarWhereClause.status;
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
