import { Router } from "express";
import authRoutes from "./auth.routes";
import dashboardRoutes from "./dashboard.routes";
import billRoutes from "./bill.routes";
import pendingBillRoutes from "./pendingBill.routes";
import operatorRoutes from "./operator.routes";
import bunkDetailRoutes from "./bunkDetail.routes";
import { authenticateJWT } from "../middlewares/authMiddleware";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

router.use("/auth", authRoutes);
router.use("/", authenticateJWT, dashboardRoutes);
router.use("/", authenticateJWT, billRoutes);
router.use("/", authenticateJWT, pendingBillRoutes);
router.use("/", authenticateJWT, operatorRoutes);
router.use("/", authenticateJWT, bunkDetailRoutes);

export default router;
