const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");
const apn = require("apn");
const fs = require("fs");
const path = require("path");

// Initialize Firebase Admin for Android FCM Data Messages
try {
  const serviceAccountPath = path.join(__dirname, "../google-services.json");
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("[VoIP] Firebase Admin initialized for Android.");
  }
} catch (error) {
  console.warn("[VoIP] Firebase Admin failed to initialize (google-services.json missing/invalid).");
}

// Initialize APNs for iOS VoIP Pushes
let apnProvider = null;
try {
  const p8Path = path.join(__dirname, "../AuthKey.p8");
  if (fs.existsSync(p8Path) && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID) {
    apnProvider = new apn.Provider({
      token: {
        key: p8Path,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID
      },
      production: process.env.NODE_ENV === "production"
    });
    console.log("[VoIP] APNs Provider initialized for iOS.");
  }
} catch (error) {
  console.warn("[VoIP] APNs Provider failed to initialize.");
}

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

/**
 * Sends a native VoIP push notification to trigger CallKit/ConnectionService
 *
 * @param {Object} params
 * @param {Object} params.user        - Recipient user object (needs fcmToken or apnsVoipToken)
 * @param {string} params.callerName  - Name of the person calling
 * @param {string} params.callType    - "audio" or "video"
 * @param {string} params.uuid        - Unique UUID for the call
 * @returns {Promise<void>}
 */
const sendVoipNotification = async ({ user, callerName, callType, uuid }) => {
  if (!user) return;

  // 1. Android FCM (ConnectionService)
  if (user.fcmToken && admin.apps.length > 0) {
    try {
      const message = {
        token: user.fcmToken,
        data: {
          type: "voip_call",
          uuid,
          callerName,
          callType
        },
        android: {
          priority: "high"
        }
      };
      await admin.messaging().send(message);
      console.log(`[VoIP] Sent FCM data message to Android user ${user.username}`);
    } catch (err) {
      console.error("[VoIP] Failed to send FCM:", err.message);
    }
  }

  // 2. iOS APNs (PushKit)
  if (user.apnsVoipToken && apnProvider) {
    try {
      const notification = new apn.Notification();
      notification.topic = `${process.env.APNS_BUNDLE_ID}.voip`;
      notification.payload = {
        uuid,
        callerName,
        hasVideo: callType === "video" ? "true" : "false"
      };
      // VoIP pushes should NOT have alert/sound payload in the APNs header, CallKit handles it
      
      const result = await apnProvider.send(notification, user.apnsVoipToken);
      if (result.failed.length > 0) {
        console.error("[VoIP] Failed to send APNs:", result.failed[0].response);
      } else {
        console.log(`[VoIP] Sent APNs VoIP push to iOS user ${user.username}`);
      }
    } catch (err) {
      console.error("[VoIP] Error sending APNs:", err);
    }
  }
};

module.exports = { sendPushNotification, isValidExpoPushToken, sendVoipNotification };
