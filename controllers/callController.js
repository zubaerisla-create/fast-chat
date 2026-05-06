const { onlineUsers } = require("../sockets/socketHandler");

/**
 * Initiates a call and notifies the receiver
 * POST /api/call/initiate
 */
const initiateCall = async (req, res) => {
    try {
        const { callerId, receiverId, channelName, callType } = req.body;

        if (!callerId || !receiverId || !channelName || !callType) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: callerId, receiverId, channelName, callType",
            });
        }

        const io = req.app.get("io");
        const receiverSocketId = onlineUsers.get(receiverId);

        if (receiverSocketId) {
            // Emit incoming_call event to the receiver
            io.to(receiverSocketId).emit("incoming_call", {
                callerId,
                callerName: req.user.name, // Assuming req.user is populated by protect middleware
                channelName,
                callType,
            });

            return res.status(200).json({
                success: true,
                message: "Call initiated and receiver notified",
            });
        } else {
            return res.status(404).json({
                success: false,
                message: "Receiver is currently offline",
            });
        }
    } catch (error) {
        console.error("Error initiating call:", error.message);
        res.status(500).json({
            success: false,
            message: "Internal server error while initiating call",
        });
    }
};

/**
 * Ends a call and notifies both parties (via channel or userIds)
 * POST /api/call/end
 */
const endCall = async (req, res) => {
    try {
        const { channelName, userId, otherUserId } = req.body;

        if (!channelName) {
            return res.status(400).json({
                success: false,
                message: "channelName is required",
            });
        }

        const io = req.app.get("io");

        // Notify the other user if ID is provided
        if (otherUserId) {
            const otherUserSocketId = onlineUsers.get(otherUserId);
            if (otherUserSocketId) {
                io.to(otherUserSocketId).emit("call_ended", { channelName });
            }
        }

        // Optionally notify the sender as well if they need confirmation via socket
        const senderSocketId = onlineUsers.get(userId || req.user.id);
        if (senderSocketId) {
            io.to(senderSocketId).emit("call_ended", { channelName });
        }

        res.status(200).json({
            success: true,
            message: "Call ended successfully",
        });
    } catch (error) {
        console.error("Error ending call:", error.message);
        res.status(500).json({
            success: false,
            message: "Internal server error while ending call",
        });
    }
};

module.exports = {
    initiateCall,
    endCall,
};
