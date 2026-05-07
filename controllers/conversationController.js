const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

/**
 * POST /api/conversations
 * Create a new 1-to-1 conversation between two users.
 * If a conversation already exists between them, return the existing one.
 */
const createConversation = async (req, res, next) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user._id;

    if (!receiverId) {
      return res
        .status(400)
        .json({ success: false, message: "Receiver ID is required." });
    }

    if (senderId.toString() === receiverId) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot create conversation with yourself." });
    }

    // Check if a conversation already exists between these two users
    // Using $all ensures order doesn't matter
    const existingConversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId], $size: 2 },
    }).populate("participants", "username email avatar isOnline lastSeen");

    if (existingConversation) {
      return res.status(200).json({
        success: true,
        message: "Conversation already exists.",
        conversation: existingConversation,
      });
    }

    // Create a new conversation
    const conversation = await Conversation.create({
      participants: [senderId, receiverId],
    });

    const populated = await conversation.populate(
      "participants",
      "username email avatar isOnline lastSeen"
    );

    res.status(201).json({
      success: true,
      message: "Conversation created.",
      conversation: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations
 * Get all conversations for the currently logged-in user,
 * sorted by most recently updated (latest message first).
 */
const getUserConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate("participants", "username email avatar isOnline lastSeen")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations/:id
 * Get a single conversation by ID (must include current user as participant).
 */
const getConversationById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id, // Security: ensure user belongs to conversation
    }).populate("participants", "username email avatar isOnline lastSeen");

    if (!conversation) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found." });
    }

    res.status(200).json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
};


/**
 * GET /api/conversations/:id/media
 * Get all shared images, videos, and files in a conversation.
 */
const getConversationMedia = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: id,
      participants: req.user._id,
    });

    if (!conversation) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found or access denied." });
    }

    // Find all messages in this conversation that have a fileUrl
    const mediaMessages = await Message.find({
      conversationId: id,
      fileUrl: { $ne: null },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: mediaMessages.length,
      media: mediaMessages,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createConversation,
  getUserConversations,
  getConversationById,
  getConversationMedia,
};
