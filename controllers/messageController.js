const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

/**
 * POST /api/messages
 * Send a new message (text, file, or both) in a conversation.
 * Body: { conversationId, text?, fileUrl?, fileType?, fileName?, fileSize? }
 */
const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, text, fileUrl, fileType, fileName, fileSize } = req.body;
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

    // Create the message
    const message = await Message.create({
      conversationId,
      senderId,
      text: text || "",
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      fileName: fileName || null,
      fileSize: fileSize || null,
    });

    // Update conversation: set lastMessage and bump updatedAt for sorting
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    // Populate sender details for the real-time response
    await message.populate("senderId", "username avatar");

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

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
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversationId }),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
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

module.exports = { sendMessage, getMessages, uploadVoiceMessage, markMessagesAsRead };
