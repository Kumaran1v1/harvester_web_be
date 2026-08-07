import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import prisma from "../config/db";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/authMiddleware";

const JWT_SECRET: string = process.env.JWT_SECRET || "your-secret-key";
const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or mobile
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { mobile: identifier }]
      }
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: "ADMIN", ownerId: null },
      JWT_SECRET,
      { expiresIn: (process.env.JWT_EXPIRATION || "24h") as any }
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        status: user.status,
        role: "ADMIN",
        address: user.address,
        companyName: user.companyName,
        profileImage: (user as any).profileImage || null
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/profile
router.get("/profile", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      role: "ADMIN",
      address: user.address,
      companyName: user.companyName,
      secondaryMobile: user.secondaryMobile,
      city: user.city,
      education: user.education,
      profileImage: (user as any).profileImage || null
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile
router.put("/profile", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      name, mobile, email, address,
      companyName, secondaryMobile, city, education, profileImage
    } = req.body;

    // Check for email/mobile uniqueness if changed
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email, id: { not: userId } }
      });
      if (existingEmail) {
        return res.status(400).json({ message: "Email is already in use" });
      }
    }
    if (mobile) {
      const existingMobile = await prisma.user.findFirst({
        where: { mobile, id: { not: userId } }
      });
      if (existingMobile) {
        return res.status(400).json({ message: "Mobile is already in use" });
      }
    }

    const updateData: any = {
      name,
      mobile,
      email,
      address,
      companyName,
      secondaryMobile,
      city,
      education
    };

    if (profileImage !== undefined) {
      updateData.profileImage = profileImage;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    res.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        mobile: updatedUser.mobile,
        status: updatedUser.status,
        role: "ADMIN",
        address: updatedUser.address,
        companyName: updatedUser.companyName,
        secondaryMobile: updatedUser.secondaryMobile,
        city: updatedUser.city,
        education: updatedUser.education,
        profileImage: (updatedUser as any).profileImage || null
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/documents (Get all owner documents)
router.get("/documents", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const docs = await prisma.ownerDocument.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/documents (Upload/Save new owner document)
router.post("/documents", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { title, category, fileUrl, fileName, fileSize, fileType } = req.body;
    if (!title || !fileUrl) {
      return res.status(400).json({ message: "Title and file are required" });
    }

    const newDoc = await prisma.ownerDocument.create({
      data: {
        userId,
        title,
        category: category || "OTHER",
        fileUrl,
        fileName: fileName || "document",
        fileSize: fileSize || "Unknown",
        fileType: fileType || "pdf"
      }
    });

    res.status(201).json(newDoc);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/documents/:id (Delete owner document)
router.delete("/documents/:id", authenticateJWT, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = req.params.id;
    await prisma.ownerDocument.deleteMany({
      where: { id, userId }
    });

    res.json({ success: true, message: "Document deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
