const User = require("../models/User");
const agoraService = require("../services/agoraService");

/**
 * In-memory map: userId (string) → socketId (string)
 * Tracks which users are currently connected and their socket IDs.
 * For multi-server deployments, replace this with Redis.
 */
const onlineUsers = new Map();

/**
 * Initializes and configures all Socket.io event handlers.
 * @param {import("socket.io").Server} io - The Socket.io server instance
 */
const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    console.log(`DEBUG: Handshake Query:`, JSON.stringify(socket.handshake.query));
    console.log(`DEBUG: Handshake Auth:`, JSON.stringify(socket.handshake.auth));

    // DEBUG: Log ALL events received from this socket to identify registration event
    socket.onAny((event, ...args) => {
      console.log(`DEBUG: Event received [${event}] from socket ${socket.id}:`, JSON.stringify(args));
    });

    // ─── USER COMES ONLINE ────────────────────────────────────────────────────
    /**
     * Client emits "userOnline" with their userId after connecting.
     * We store the mapping and broadcast the updated online users list.
     */
    socket.on("userOnline", async (userId) => {
      if (!userId) return;

      onlineUsers.set(userId, socket.id);
      socket.userId = userId; // Attach userId to socket for cleanup on disconnect

      console.log(`DEBUG: User ${userId} is now mapped to socket ${socket.id}`);
      console.log(`DEBUG: Current online users: ${Array.from(onlineUsers.keys())}`);

      // Notify all clients about the currently online user list
      io.emit("onlineUsers", Array.from(onlineUsers.keys()));

      // Update user's online status in the database
      try {
        await User.findByIdAndUpdate(userId, { isOnline: true });
      } catch (err) {
        console.error("Failed to update online status:", err.message);
      }

      console.log(`👤 User online: ${userId} | Total online: ${onlineUsers.size}`);
    });

    // ─── SEND MESSAGE IN REAL-TIME ────────────────────────────────────────────
    /**
     * Client emits "sendMessage" with message data after the REST API call succeeds.
     * We look up the receiver's socket ID and emit the message directly to them.
     *
     * Expected payload: { receiverId, message }
     *  - receiverId: MongoDB ObjectId string of the recipient
     *  - message: the full message object returned by the POST /api/messages endpoint
     */
    socket.on("sendMessage", ({ receiverId, message }) => {
      if (!receiverId || !message) return;

      const receiverSocketId = onlineUsers.get(receiverId);

      if (receiverSocketId) {
        // Deliver message only to the specific receiver's socket
        io.to(receiverSocketId).emit("receiveMessage", message);
        console.log(`📨 Message delivered to ${receiverId}`);
      } else {
        console.log(`📭 Receiver ${receiverId} is offline — message stored in DB`);
      }
    });

    // ─── TYPING INDICATORS ───────────────────────────────────────────────────
    /**
     * Relay typing status to the other participant in a conversation.
     * Payload: { receiverId, conversationId }
     */
    socket.on("typing", ({ receiverId, conversationId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("userTyping", {
          senderId: socket.userId,
          conversationId,
        });
      }
    });

    socket.on("stopTyping", ({ receiverId, conversationId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("userStoppedTyping", {
          senderId: socket.userId,
          conversationId,
        });
      }
    });

    // ─── CALL SIGNALING ──────────────────────────────────────────────────────
    /**
     * Relays call acceptance to the caller.
     * Payload: { callerId, channelName }
     */
    socket.on("call_accepted", ({ callerId, channelName }) => {
      const callerSocketId = onlineUsers.get(callerId);
      if (callerSocketId) {
        try {
          // Generate tokens for both parties (using fixed UIDs 1 and 2 for simplicity in 1-to-1)
          const callerTokenData = agoraService.getRtcToken(channelName, 1);
          const receiverTokenData = agoraService.getRtcToken(channelName, 2);

          // Notify caller that call was accepted and provide join info
          io.to(callerSocketId).emit("acceptCall", {
            receiverId: socket.userId,
            channelName,
            token: callerTokenData.token,
            uid: 1,
            appId: callerTokenData.appId
          });

          // Notify receiver (current socket) to join as well
          socket.emit("acceptCall", {
            callerId,
            channelName,
            token: receiverTokenData.token,
            uid: 2,
            appId: receiverTokenData.appId
          });

          console.log(`[Socket] Call accepted: ${socket.userId} (Receiver) -> ${callerId} (Caller)`);
          console.log(`[Agora] Tokens generated for channel: ${channelName}`);
        } catch (error) {
          console.error("[Agora] Token generation failed:", error.message);
          socket.emit("call_error", { message: "Failed to join call" });
        }
      }
    });

    /**
     * Relays call rejection to the caller.
     * Payload: { callerId }
     */
    socket.on("call_rejected", ({ callerId }) => {
      const callerSocketId = onlineUsers.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call_rejected", {
          receiverId: socket.userId,
        });
        console.log(`🚫 [Socket] Call rejected: ${socket.userId} -> ${callerId}`);
      }
    });

    /**
     * Relays call end to the other participant.
     * Payload: { otherUserId, channelName }
     */
    socket.on("call_ended", ({ otherUserId, channelName }) => {
      const otherUserSocketId = onlineUsers.get(otherUserId);
      if (otherUserSocketId) {
        io.to(otherUserSocketId).emit("call_ended", { channelName });
        console.log(`🏁 [Socket] Call ended: ${socket.userId} for channel ${channelName}`);
      }
      // Also notify current user to ensure cleanup
      socket.emit("call_ended", { channelName });
    });

    // ─── USER DISCONNECTS ─────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);

        // Broadcast updated online users list to all remaining clients
        io.emit("onlineUsers", Array.from(onlineUsers.keys()));

        // Update user's online status and lastSeen in the database
        try {
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastSeen: new Date(),
          });
        } catch (err) {
          console.error("Failed to update offline status:", err.message);
        }

        console.log(
          `❌ User disconnected: ${socket.userId} | Total online: ${onlineUsers.size}`
        );
      }
    });
  });
};

module.exports = { initializeSocket, onlineUsers };
