import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_change_this_in_production";

export interface AuthenticatedRequest extends Request {
  io?: any;
  user?: {
    id: string;
    email: string;
    role: string;
    ownerId?: string | null;
  };
}

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }

      req.user = decoded as AuthenticatedRequest["user"];
      next();
    });
  } else {
    res.status(401).json({ message: "Authorization token is missing or malformed" });
  }
};

export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(43) // Forbidden: 403
        .json({ message: `Access denied: Role ${req.user.role} does not have permission.` });
    }

    next();
  };
};
