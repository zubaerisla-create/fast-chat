const User = require("../models/User");
const agoraService = require("../services/agoraService");

/**
 * In-memory map: userId (string) → socketId (string)
 * For multi-server deployments, replace this with Redis.
 */
const onlineUsers = new Map();

/**
 * In-memory map: channelName (string) → { callerId, receiverId, callType }
 * Tracks active calls so we always have the authoritative channel name.
 */
const activeCalls = new Map();

const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── USER COMES ONLINE ───────────────────────────────────────────────────
    socket.on("userOnline", async (userId) => {
      if (!userId) return;

      onlineUsers.set(userId, socket.id);
      socket.userId = userId;

      console.log(`👤 [Online] ${userId} → socket ${socket.id}`);
      console.log(`📋 [Online] All connected: ${JSON.stringify(Array.from(onlineUsers.entries()))}`);

      io.emit("onlineUsers", Array.from(onlineUsers.keys()));

      try {
        await User.findByIdAndUpdate(userId, { isOnline: true });
      } catch (err) {
        console.error("Failed to update online status:", err.message);
      }
    });

    // ─── MESSAGES ────────────────────────────────────────────────────────────
    socket.on("sendMessage", ({ receiverId, message }) => {
      if (!receiverId || !message) return;
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receiveMessage", message);
      }
    });

    // ─── TYPING ──────────────────────────────────────────────────────────────
    socket.on("typing", ({ receiverId, conversationId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("userTyping", { senderId: socket.userId, conversationId });
      }
    });

    socket.on("stopTyping", ({ receiverId, conversationId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("userStoppedTyping", { senderId: socket.userId, conversationId });
      }
    });

    // ─── CALL SIGNALING ──────────────────────────────────────────────────────

    /**
     * Step 1: Caller initiates a call.
     * The SERVER generates the authoritative channelName to prevent mismatches.
     * Payload: { receiverId, callType: "audio"|"video" }
     */
    socket.on("initiate_call", ({ receiverId, callType }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      const callerId = socket.userId;

      if (!callerId) {
        socket.emit("call_error", { message: "You are not authenticated" });
        return;
      }

      console.log(`📞 [Call] initiate_call from ${callerId} → ${receiverId} (${callType})`);

      if (!receiverSocketId) {
        socket.emit("call_error", { message: "Receiver is currently offline" });
        return;
      }

      // SERVER generates the channel name — single source of truth
      // Keep channel name ≤ 64 chars (Agora hard limit)
      // Use last 8 chars of each ID + base-36 timestamp (~8 chars) = ~28 chars total
      const channelName = `ch_${callerId.slice(-8)}_${receiverId.slice(-8)}_${Date.now().toString(36)}`;

      // Store the active call
      activeCalls.set(channelName, { callerId, receiverId, callType });

      console.log(`📡 [Call] Channel created: ${channelName}`);

      // Notify receiver
      io.to(receiverSocketId).emit("incomingCall", {
        callerId,
        channelName,
        callType,
      });

      // Confirm to caller
      socket.emit("call_initiated", { receiverId, channelName, callType });
    });

    /**
     * Step 2: Receiver accepts the call.
     * Backend generates & broadcasts Agora tokens to BOTH parties with the SAME channelName.
     * Payload: { callerId, channelName }
     */
    socket.on("accept_call", ({ callerId, channelName }) => {
      const callerSocketId = onlineUsers.get(callerId);
      const receiverId = socket.userId;

      console.log(`✅ [Call] accept_call for channel: ${channelName} by ${receiverId}`);
      console.log(`🔍 [Call] Caller socket: ${callerSocketId}, Receiver socket: ${socket.id}`);

      if (!callerSocketId) {
        socket.emit("call_error", { message: "Caller is no longer online" });
        return;
      }

      try {
        // Generate tokens for SAME channel, different UIDs
        const callerToken = agoraService.getRtcToken(channelName, 1);
        const receiverToken = agoraService.getRtcToken(channelName, 2);

        console.log(`🎫 [Agora] Tokens generated for channel: ${channelName}`);
        console.log(`   Caller UID: 1, Receiver UID: 2`);

        // Send to Caller (uid=1)
        io.to(callerSocketId).emit("call_joined", {
          channelName,
          token: callerToken.token,
          uid: 1,
          appId: callerToken.appId,
          otherUserId: receiverId,
          callType: activeCalls.get(channelName)?.callType || "audio",
        });

        // Send to Receiver (uid=2)
        socket.emit("call_joined", {
          channelName,
          token: receiverToken.token,
          uid: 2,
          appId: receiverToken.appId,
          otherUserId: callerId,
          callType: activeCalls.get(channelName)?.callType || "audio",
        });

        console.log(`🚀 [Call] call_joined emitted to both parties. Channel: ${channelName}`);
      } catch (error) {
        console.error("[Agora] Token generation FAILED:", error.message);
        socket.emit("call_error", { message: "Failed to generate Agora token" });
        io.to(callerSocketId).emit("call_error", { message: "Failed to generate Agora token" });
      }
    });

    /**
     * Step 3a: Receiver rejects the call.
     * Payload: { callerId, channelName }
     */
    socket.on("reject_call", ({ callerId, channelName }) => {
      const callerSocketId = onlineUsers.get(callerId);
      activeCalls.delete(channelName);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call_rejected", { receiverId: socket.userId });
        console.log(`🚫 [Call] Rejected: ${socket.userId} → ${callerId}`);
      }
    });

    /**
     * Step 4: Either party ends the call.
     * Payload: { otherUserId, channelName }
     */
    socket.on("end_call", ({ otherUserId, channelName }) => {
      const otherSocketId = onlineUsers.get(otherUserId);
      activeCalls.delete(channelName);

      console.log(`🏁 [Call] end_call from ${socket.userId}, channel: ${channelName}`);

      if (otherSocketId) {
        io.to(otherSocketId).emit("call_ended", { channelName });
      }
      socket.emit("call_ended", { channelName });
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit("onlineUsers", Array.from(onlineUsers.keys()));

        try {
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastSeen: new Date(),
          });
        } catch (err) {
          console.error("Failed to update offline status:", err.message);
        }

        console.log(`❌ [Disconnect] ${socket.userId} offline. Total: ${onlineUsers.size}`);
      }
    });
  });
};

module.exports = { initializeSocket, onlineUsers };
