const agoraService = require("../services/agoraService");

/**
 * Handles requesting an Agora RTC token
 * POST /api/agora/token
 */
const getAgoraToken = async (req, res) => {
    try {
        const { channelName, uid } = req.body;

        if (!channelName) {
            return res.status(400).json({
                success: false,
                message: "channelName is required",
            });
        }

        const tokenData = agoraService.getRtcToken(channelName, uid);

        res.status(200).json({
            success: true,
            ...tokenData,
        });
    } catch (error) {
        console.error("Error generating Agora token:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to generate Agora token",
        });
    }
};

module.exports = {
    getAgoraToken,
};
