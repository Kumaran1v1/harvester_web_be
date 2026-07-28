import { Router } from "express";
import prisma from "../config/db";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";

const router = Router();

// GET /api/dashboard
router.get("/dashboard", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;

    const [
      userProfile,
      classBillsCount,
      classBillsSums,
      pendingClassCount,
      kartarBillsCount,
      kartarBillsSums,
      pendingKartarCount,
      operatorsCount,
      operatorAttendanceSums,
      bunkCount,
      bunkSums,
      recentClassBills,
      recentKartarBills,
      recentBunkDetails
    ] = await Promise.all([
      userId ? prisma.user.findUnique({ where: { id: userId }, select: { name: true, mobile: true, email: true, companyName: true, address: true } }) : null,
      prisma.classBill.count(),
      prisma.classBill.aggregate({
        _sum: { advance: true, balance: true, totalAmount: true }
      }),
      prisma.classBill.count({ where: { status: 0 } }),
      prisma.kartarBill.count(),
      prisma.kartarBill.aggregate({
        _sum: { advance: true, balance: true, totalAmount: true }
      }),
      prisma.kartarBill.count({ where: { status: 0 } }),
      prisma.operator.count(),
      prisma.operatorAttendance.aggregate({
        where: { status: "PRESENT" },
        _sum: { dailyWage: true }
      }),
      prisma.bunkDetail.count(),
      prisma.bunkDetail.aggregate({
        _sum: { fuelAmount: true, paidAmount: true, balance: true }
      }),
      prisma.classBill.findMany({ take: 3, orderBy: { date: "desc" } }),
      prisma.kartarBill.findMany({ take: 3, orderBy: { date: "desc" } }),
      prisma.bunkDetail.findMany({ take: 3, orderBy: { date: "desc" } })
    ]);

    const totalBills = classBillsCount + kartarBillsCount;
    const totalClassAdvance = Number(classBillsSums._sum.advance || 0);
    const totalClassBalance = Number(classBillsSums._sum.balance || 0);
    const totalKartarAdvance = Number(kartarBillsSums._sum.advance || 0);
    const totalKartarBalance = Number(kartarBillsSums._sum.balance || 0);

    const totalAdvance = totalClassAdvance + totalKartarAdvance;
    const totalCustomerBalance = totalClassBalance + totalKartarBalance;
    const totalPendingBillsCount = pendingClassCount + pendingKartarCount;

    const totalBilledRevenue = totalAdvance + totalCustomerBalance;
    const totalOperatorSalaryPaid = Number(operatorAttendanceSums._sum.dailyWage || 0);

    const totalFuelAmount = Number(bunkSums._sum.fuelAmount || 0);
    const totalFuelPaid = Number(bunkSums._sum.paidAmount || 0);
    const totalFuelPending = Number(bunkSums._sum.balance || 0);

    const totalExpenses = totalOperatorSalaryPaid + totalFuelAmount;
    const netProfit = totalBilledRevenue - totalExpenses;

    res.json({
      user: userProfile,
      totalBills,
      classBillsCount,
      kartarBillsCount,
      totalAdvance,
      totalBalance: totalCustomerBalance,
      totalPendingBillsCount,
      totalPendingBalance: totalCustomerBalance,
      totalOperators: operatorsCount,
      totalOperatorSalaryPaid,
      totalFuelPurchases: bunkCount,
      totalFuelAmount,
      totalFuelPaid,
      totalFuelPending,
      totalBilledRevenue,
      totalExpenses,
      netProfit,
      recentActivity: {
        classBills: recentClassBills,
        kartarBills: recentKartarBills,
        bunkDetails: recentBunkDetails
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
