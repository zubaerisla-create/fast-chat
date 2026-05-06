const { generateAgoraToken } = require("../utils/tokenBuilder");

/**
 * Generates token and appId for a specific channel and user
 * @param {string} channelName 
 * @param {string|number} uid 
 * @returns {Object} { token, appId }
 */
const getRtcToken = (channelName, uid) => {
    if (!channelName) {
        throw new Error("Channel name is required");
    }

    // Provide a default uid if not passed (0 allows Agora to assign one)
    const userId = uid || 0;
    const token = generateAgoraToken(channelName, userId);

    return {
        token,
        appId: process.env.AGORA_APP_ID,
    };
};

module.exports = {
    getRtcToken,
};
