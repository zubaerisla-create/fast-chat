const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "Conversation ID is required"],
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender ID is required"],
    },
    // Text is optional when a file is attached
    text: {
      type: String,
      trim: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
      default: "",
    },
    replyToMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    replyToText: {
      type: String,
      trim: true,
      default: null,
    },
    replyToSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ── File / Media attachment ─────────────────────────────────────────────
    fileUrl: {
      type: String,
      default: null,
    },
    fileType: {
      type: String,
      enum: ["image", "video", "audio", "file", null],
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number, // bytes
      default: null,
    },
    audioDuration: {
      type: Number, // seconds
      default: null,
    },
    // ───────────────────────────────────────────────────────────────────────
    isRead: {
      type: Boolean,
      default: false,
    },
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        emoji: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      }
    ],
  },
  { timestamps: true }
);

// Index for fast message retrieval by conversation, sorted by time
messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
