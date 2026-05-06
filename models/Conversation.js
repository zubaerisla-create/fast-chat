const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    // Exactly two participants for 1-to-1 chat
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    // Reference to the most recent message for efficient conversation list rendering
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
  },
  { timestamps: true }
);

// Ensure exactly 2 participants per conversation
conversationSchema.path("participants").validate(function (val) {
  return val.length === 2;
}, "A conversation must have exactly 2 participants");

// Index for fast lookup of conversations by participant pair
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
