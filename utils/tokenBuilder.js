const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

/**
 * Generates an Agora RTC Token
 * @param {string} channelName 
 * @param {number|string} uid 
 * @returns {string} 
 */
const generateAgoraToken = (channelName, uid) => {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
        throw new Error("Agora App ID and Certificate are required");
    }

    // Set token expiration (default 1 hour)
    const expirationTimeInSeconds = process.env.AGORA_TOKEN_EXPIRY || 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + parseInt(expirationTimeInSeconds, 10);

    // Use Publisher role for all users in a 1-to-1 call
    const role = RtcRole.PUBLISHER;

    let token;
    if (isNaN(uid)) {
        // uid is string (Account)
        token = RtcTokenBuilder.buildTokenWithAccount(
            appId,
            appCertificate,
            channelName,
            uid,
            role,
            privilegeExpiredTs
        );
    } else {
        // uid is integer
        token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channelName,
            parseInt(uid, 10),
            role,
            privilegeExpiredTs
        );
    }

    return token;
};

module.exports = { generateAgoraToken };
