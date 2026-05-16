require("dotenv").config();
// v1.0.1 - Agora Signaling Integration

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const messageRoutes = require("./routes/messageRoutes");
const agoraRoutes = require("./routes/agoraRoutes");
const callRoutes = require("./routes/callRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { errorHandler } = require("./middleware/errorMiddleware");
const { initializeSocket } = require("./sockets/socketHandler");

const app = express();

// ─── Database ─────────────────────────────────────────────────────────────────
connectDB();

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || ["http://localhost:3000", "http://localhost:3001", "https://fast-chat-frontend-swart.vercel.app", "CLIENT_URL=https://fast-chat-frontend-app.vercel.app", "https://fast-chat-nwbp.onrender.com"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10kb" })); // Limit request body size
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/agora", agoraRoutes);
app.use("/api/call", callRoutes);
app.use("/api/upload", uploadRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── HTTP + Socket.io Server ──────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || ["http://localhost:3000", "http://localhost:3001", "https://fast-chat-frontend-swart.vercel.app", "CLIENT_URL=https://fast-chat-frontend-app.vercel.app", "https://fast-chat-nwbp.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,   // How long to wait for pong before closing connection
  pingInterval: 25000,  // How often to ping the client
});

// Register all socket event handlers
initializeSocket(io);

// Store io in app to access from controllers
app.set("io", io);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  console.log(`📡 Socket.io ready for real-time connections`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  httpServer.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err.message);
  httpServer.close(() => process.exit(1));
});
