const { Expo } = require("expo-server-sdk");

// Single shared Expo client instance
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

/**
 * Validates that a token is a valid Expo push token.
 * @param {string} token
 * @returns {boolean}
 */
const isValidExpoPushToken = (token) => {
  return typeof token === "string" && Expo.isExpoPushToken(token);
};

/**
 * Sends a push notification to a single Expo push token.
 *
 * @param {Object} params
 * @param {string} params.to          - Expo push token of the recipient
 * @param {string} params.title       - Notification title
 * @param {string} params.body        - Notification body text
 * @param {Object} params.data        - Custom data payload (e.g. { type, chatId, senderId })
 * @param {string} [params.sound]     - Notification sound ("default" | null)
 * @returns {Promise<void>}
 */
const sendPushNotification = async ({ to, title, body, data = {}, sound = "default" }) => {
  if (!isValidExpoPushToken(to)) {
    console.warn(`[Push] Invalid or missing Expo push token: ${to}`);
    return;
  }

  const message = {
    to,
    sound,
    title,
    body,
    data,
    // Android channel for grouped notifications
    channelId: "chat-messages",
    // Priority ensures delivery even in Doze mode on Android
    priority: "high",
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);

    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      // Log any errors returned per-ticket
      ticketChunk.forEach((ticket, idx) => {
        if (ticket.status === "error") {
          console.error(
            `[Push] Ticket error for token ${chunk[idx]?.to}: ${ticket.message}`,
            ticket.details || ""
          );

          // DeviceNotRegistered means the token is stale — caller should handle cleanup
          if (ticket.details?.error === "DeviceNotRegistered") {
            console.warn(`[Push] Token is no longer registered: ${chunk[idx]?.to}`);
          }
        }
      });
    }
  } catch (error) {
    // Non-fatal: log and continue — a failed push should never break message delivery
    console.error("[Push] Failed to send push notification:", error.message);
  }
};

module.exports = { sendPushNotification, isValidExpoPushToken };
