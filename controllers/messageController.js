const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

/**
 * POST /api/messages
 * Send a new message in a conversation.
 * Also updates the conversation's lastMessage reference and updatedAt timestamp.
 */
const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, text } = req.body;
    const senderId = req.user._id;

    if (!conversationId || !text) {
      return res
        .status(400)
        .json({ success: false, message: "Conversation ID and text are required." });
    }

    // Verify the sender is actually a participant in this conversation
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
    const message = await Message.create({ conversationId, senderId, text });

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

module.exports = { sendMessage, getMessages };
