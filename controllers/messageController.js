const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { sendPushNotification } = require("../services/pushNotificationService");

/**
 * POST /api/messages
 * Send a new message (text, file, or both) in a conversation.
 * Body: { conversationId, text?, fileUrl?, fileType?, fileName?, fileSize? }
 */
const sendMessage = async (req, res, next) => {
  try {
    const {
      conversationId,
      text,
      fileUrl,
      fileType,
      fileName,
      fileSize,
      audioDuration,
      replyToMessageId,
      replyToText,
      replyToSenderId,
      replyToSender,
    } = req.body;
    const senderId = req.user._id;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "Conversation ID is required." });
    }

    // Must have at least text or a file
    if (!text && !fileUrl) {
      return res.status(400).json({
        success: false,
        message: "A message must contain text or a file.",
      });
    }

    // Verify the sender is a participant in this conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: senderId,
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation.",
      });
    }

    const replyToSenderIdValue = replyToSenderId || replyToSender || null;

    // Create the message
    const message = await Message.create({
      conversationId,
      senderId,
      text: text || "",
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      fileName: fileName || null,
      fileSize: fileSize || null,
      audioDuration: audioDuration || null,
      replyToMessageId: replyToMessageId || null,
      replyToText: replyToText || null,
      replyToSenderId: replyToSenderIdValue,
    });

    // Update conversation: set lastMessage and bump updatedAt for sorting
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    // Populate sender details for the real-time response
    await message.populate("senderId", "username avatar");

    // ─── Real-time: broadcast message to ALL participants in this conversation ──
    const io = req.app.get("io");
    if (io) {
      // Re-fetch conversation to get all participant IDs
      const { onlineUsers } = require("../sockets/socketHandler");
      const fullConversation = await Conversation.findById(conversationId).select("participants");
      if (fullConversation) {
        for (const participantId of fullConversation.participants) {
          // Don't echo back to the sender
          if (participantId.toString() === senderId.toString()) continue;

          const receiverSocketId = onlineUsers.get(participantId.toString());

          // ── Socket delivery (online users) ──────────────────────────────
          if (receiverSocketId) {
            io.to(receiverSocketId).emit("receiveMessage", {
              message: {
                _id: message._id,
                id: message._id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                text: message.text,
                fileUrl: message.fileUrl,
                fileType: message.fileType,
                fileName: message.fileName,
                audioDuration: message.audioDuration,
                replyToMessageId: message.replyToMessageId,
                replyToText: message.replyToText,
                replyToSenderId: message.replyToSenderId,
                isRead: message.isRead,
                createdAt: message.createdAt,
                timestamp: message.createdAt,
              },
            });
          }

          // ── Push notification ────────────────────────────────────────────
          // ALWAYS send push — even if the receiver has an active socket.
          //
          // Why: A connected socket does NOT mean the user is looking at the app.
          // On mobile, the socket stays alive via TCP keepalive even when the user
          // switches to another app. Skipping push in that case means they never
          // get notified.
          //
          // Duplicate prevention is handled on the FRONTEND:
          //   - If the app is foregrounded AND the user is inside this exact chat,
          //     the notification listener suppresses the banner (chatId check).
          //   - If the app is backgrounded/killed, the OS shows the notification.
          try {
            const receiver = await User.findById(participantId).select("expoPushToken username");
            if (receiver?.expoPushToken) {
              const senderName = message.senderId?.username || "Someone";
              const notificationBody = message.text
                ? `${senderName}: ${message.text.slice(0, 100)}`
                : `${senderName} sent ${
                    message.fileType === "image"
                      ? "a photo"
                      : message.fileType === "audio"
                      ? "a voice message"
                      : "a file"
                  }`;

              console.log(`[Push] Sending to ${participantId} (socket ${receiverSocketId ? "alive" : "offline"}): ${notificationBody}`);

              await sendPushNotification({
                to: receiver.expoPushToken,
                title: "New Message",
                body: notificationBody,
                data: {
                  type: "chat",
                  chatId: conversationId.toString(),
                  senderId: senderId.toString(),
                },
              });
            } else {
              console.log(`[Push] No push token for user ${participantId} — skipping.`);
            }
          } catch (pushError) {
            // Push failure must never break message delivery
            console.error("[Push] Error sending notification:", pushError.message);
          }
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/messages/:conversationId
 * Get all messages in a conversation (paginated, oldest first).
 * Supports ?page and ?limit query params.
 */
const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    // Security: verify user belongs to the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation.",
      });
    }

    const [messages, total] = await Promise.all([
      Message.find({ conversationId })
        .populate("senderId", "username avatar")
        .populate("reactions.userId", "username avatar")
        .sort({ createdAt: 1 }),
      Message.countDocuments({ conversationId }),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: 1,
      pages: 1,
      messages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/messages/:conversationId/mark-read
 * Mark all incoming unread messages in a conversation as read.
 */
const markMessagesAsRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation.",
      });
    }

    const unreadMessages = await Message.find({
      conversationId,
      senderId: { $ne: userId },
      isRead: false,
    }).select("_id senderId");

    if (unreadMessages.length === 0) {
      return res.status(200).json({
        success: true,
        updatedCount: 0,
        messageIds: [],
      });
    }

    const messageIds = unreadMessages.map((message) => message._id);

    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    // ─── Real-time: notify the original senders that their messages were seen ──
    const io = req.app.get("io");
    if (io && unreadMessages.length > 0) {
      const { onlineUsers } = require("../sockets/socketHandler");
      // Group messageIds by senderId so each sender gets one notification
      const senderIds = [...new Set(unreadMessages.map((m) => m.senderId.toString()))];
      senderIds.forEach((senderId) => {
        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messagesSeen", {
            conversationId,
            messageIds: messageIds.map((id) => id.toString()),
            seenBy: userId.toString(),
            seenAt: new Date(),
          });
        }
      });
    }
    // ──────────────────────────────────────────────────────────────────────────────

    res.status(200).json({
      success: true,
      updatedCount: messageIds.length,
      messageIds,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * POST /api/messages/voice
 * Upload a voice message (audio file) to Cloudinary and save to database.
 * Body: { conversationId }, File: audio
 */
const uploadVoiceMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.body;
    const senderId = req.user._id;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "Conversation ID is required." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No audio file provided." });
    }

    // Verify conversation access
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: senderId,
    });

    if (!conversation) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Stream to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "voice-messages",
          resource_type: "video", // Cloudinary handles audio as 'video' resource_type
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    // Create the message
    const message = await Message.create({
      conversationId,
      senderId,
      text: "",
      fileUrl: uploadResult.secure_url,
      fileType: "audio",
      fileName: req.file.originalname || "voice-message.webm",
      fileSize: req.file.size,
    });

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    await message.populate("senderId", "username avatar");

    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to extract Cloudinary publicId from fileUrl
 */
const extractPublicIdFromUrl = (url) => {
  try {
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex === -1) return null;

    let publicIdParts = parts.slice(uploadIndex + 1);
    // If the next part is version (e.g. v1570975253), skip it
    if (publicIdParts[0].startsWith("v") && !isNaN(publicIdParts[0].substring(1))) {
      publicIdParts = publicIdParts.slice(1);
    }

    const publicIdWithExt = publicIdParts.join("/");
    const dotIndex = publicIdWithExt.lastIndexOf(".");
    if (dotIndex !== -1) {
      return publicIdWithExt.substring(0, dotIndex);
    }
    return publicIdWithExt;
  } catch (error) {
    console.error("Error extracting public ID:", error);
    return null;
  }
};

/**
 * DELETE /api/messages/:messageId
 * Delete a message (only by the sender) and remove its file from Cloudinary if any.
 */
const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    // Only the sender can delete their message
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only delete your own messages." });
    }

    // If there is an associated file, attempt to delete it from Cloudinary
    if (message.fileUrl) {
      const publicId = extractPublicIdFromUrl(message.fileUrl);
      if (publicId) {
        let resourceType = "raw";
        if (message.fileType === "image") {
          resourceType = "image";
        } else if (message.fileType === "video" || message.fileType === "audio") {
          resourceType = "video";
        }

        console.log(`🗑️ Deleting file from Cloudinary: ${publicId} (type: ${resourceType})`);
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        } catch (cloudinaryError) {
          console.error("Error deleting from Cloudinary:", cloudinaryError.message);
        }
      }
    }

    // Delete the message from DB
    await Message.findByIdAndDelete(messageId);

    // If this was the last message of the conversation, update the conversation's lastMessage reference
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation && conversation.lastMessage && conversation.lastMessage.toString() === messageId) {
      const lastMsg = await Message.findOne({ conversationId: message.conversationId })
        .sort({ createdAt: -1 });
      
      await Conversation.findByIdAndUpdate(message.conversationId, {
        lastMessage: lastMsg ? lastMsg._id : null,
      });
    }

    // Notify other users via socket
    const io = req.app.get("io");
    if (io) {
      const { onlineUsers } = require("../sockets/socketHandler");
      const fullConversation = await Conversation.findById(message.conversationId).select("participants");
      if (fullConversation) {
        fullConversation.participants.forEach((participantId) => {
          if (participantId.toString() === userId.toString()) return;
          const receiverSocketId = onlineUsers.get(participantId.toString());
          if (receiverSocketId) {
            io.to(receiverSocketId).emit("messageDeleted", {
              messageId,
              conversationId: message.conversationId,
            });
          }
        });
      }
    }

    res.status(200).json({ success: true, message: "Message deleted successfully." });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/messages/:messageId/react
 * Add, remove, or update a reaction on a message.
 * Body: { emoji }
 */
const reactToMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ success: false, message: "Emoji is required." });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    // Verify user is a participant in this conversation
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: userId,
    });
    if (!conversation) {
      return res.status(403).json({ success: false, message: "You are not a participant in this conversation." });
    }

    // Initialize reactions array if it doesn't exist
    if (!message.reactions) {
      message.reactions = [];
    }

    // Check if user already reacted
    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingReactionIndex > -1) {
      if (message.reactions[existingReactionIndex].emoji === emoji) {
        // If same emoji, remove reaction (toggle behavior)
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Update to new emoji
        message.reactions[existingReactionIndex].emoji = emoji;
        message.reactions[existingReactionIndex].createdAt = new Date();
      }
    } else {
      // Add new reaction
      message.reactions.push({ userId, emoji, createdAt: new Date() });
    }

    await message.save();

    // Populate reactions user details
    await message.populate("reactions.userId", "username avatar");

    // ─── Real-time: broadcast to all participants ──
    const io = req.app.get("io");
    if (io) {
      const { onlineUsers } = require("../sockets/socketHandler");
      conversation.participants.forEach((participantId) => {
        const socketId = onlineUsers.get(participantId.toString());
        if (socketId) {
          io.to(socketId).emit("messageReactionUpdated", {
            messageId: message._id,
            conversationId: message.conversationId,
            reactions: message.reactions,
          });
        }
      });
    }

    res.status(200).json({ success: true, reactions: message.reactions });
  } catch (error) {
    next(error);
  }
};

module.exports = { sendMessage, getMessages, uploadVoiceMessage, markMessagesAsRead, deleteMessage, reactToMessage, extractPublicIdFromUrl };

