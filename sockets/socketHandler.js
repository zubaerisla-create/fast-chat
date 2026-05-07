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
     * Initiates a call via socket.
     * Payload: { receiverId, channelName, callType }
     */
    socket.on("initiate_call", ({ receiverId, channelName, callType }) => {
      const receiverSocketId = onlineUsers.get(receiverId);

      console.log(`[Socket] Call initiated by ${socket.userId} for receiver ${receiverId}`);

      if (receiverSocketId) {
        // Notify the receiver
        io.to(receiverSocketId).emit("incoming_call", {
          callerId: socket.userId,
          callerName: "A User", // Ideally fetched from DB or socket session
          channelName,
          callType,
        });

        // Confirm to caller that the call is being placed
        socket.emit("call_initiated", { receiverId, channelName, callType });
      } else {
        socket.emit("call_error", { message: "Receiver is offline" });
      }
    });

    /**
     * Relays call acceptance to the caller and provides Agora tokens to both.
     * Payload: { callerId, channelName }
     */
    socket.on("call_accepted", ({ callerId, channelName }) => {
      const callerSocketId = onlineUsers.get(callerId);

      console.log(`[Socket] Call acceptance received from ${socket.userId} for caller ${callerId}`);

      if (callerSocketId) {
        try {
          // Generate unique tokens for both parties
          const callerTokenData = agoraService.getRtcToken(channelName, 1);
          const receiverTokenData = agoraService.getRtcToken(channelName, 2);

          // Both users get the SAME event name with their specific token/uid
          // This ensures the frontend state machine moves to ONGOING at the same time

          // Emit to Caller
          io.to(callerSocketId).emit("acceptCall", {
            otherUserId: socket.userId,
            channelName,
            token: callerTokenData.token,
            uid: 1,
            appId: callerTokenData.appId
          });

          // Emit to Receiver
          socket.emit("acceptCall", {
            otherUserId: callerId,
            channelName,
            token: receiverTokenData.token,
            uid: 2,
            appId: receiverTokenData.appId
          });

          console.log(`[Socket] acceptCall emitted to both. Channel: ${channelName}`);
        } catch (error) {
          console.error("[Agora] Token generation failed:", error.message);
          io.to(callerSocketId).to(socket.id).emit("call_error", { message: "Agora token error" });
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

      console.log(`🏁 [Socket] Call end signal from ${socket.userId} for child ${channelName}`);

      if (otherUserSocketId) {
        io.to(otherUserSocketId).emit("call_ended", { channelName });
      }

      // Always confirm back to the sender
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
