import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import apiRoutes from "./routes";
import { startNotificationScheduler } from "./services/scheduler.service";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Setup Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }
});

// Socket connection logic
io.on("connection", (socket) => {
  console.log(`User connected via socket: ${socket.id}`);
  
  // Clients will emit a 'join' event with their role/ID upon connecting
  socket.on("join", (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room ${room}`);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Attach io to req object for use in routes
app.use((req: any, res, next) => {
  req.io = io;
  next();
});

// Enable CORS
app.use(
  cors({
    origin: "*", // Adjust in production to allow specific frontend domains
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body Parser Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static uploads
app.use("/uploads", express.static("uploads"));

// Base API route
app.use("/api", apiRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("Harvester Management System API is running.");
});

// Global Error Handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error Handler:", err.stack);
  res.status(500).json({
    message: "An internal server error occurred",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start Server
httpServer.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || "development"} mode on http://localhost:${PORT}`);
  startNotificationScheduler();
});

