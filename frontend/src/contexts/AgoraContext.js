import React, { createContext, useContext, useState, useRef } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";

const AgoraContext = createContext();

// Create singleton client
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export const AgoraProvider = ({ children }) => {
    const [localVideoTrack, setLocalVideoTrack] = useState(null);
    const [localAudioTrack, setLocalAudioTrack] = useState(null);
    const [remoteUsers, setRemoteUsers] = useState([]);
    const tracksRef = useRef([]);

    const joinChannel = async (appId, channel, token, uid, callType) => {
        try {
            console.log(`[Agora] Joining channel: ${channel} as UID: ${uid}`);
            await client.join(appId, channel, token, uid);

            // Create tracks based on call type
            let audioTrack, videoTrack;

            audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            setLocalAudioTrack(audioTrack);
            tracksRef.current.push(audioTrack);

            if (callType === "video") {
                videoTrack = await AgoraRTC.createCameraVideoTrack();
                setLocalVideoTrack(videoTrack);
                tracksRef.current.push(videoTrack);
                await client.publish([audioTrack, videoTrack]);
            } else {
                await client.publish([audioTrack]);
            }

            console.log("[Agora] Successfully joined and published tracks");
        } catch (err) {
            console.error("[Agora] Failed to join channel:", err);
            throw err;
        }
    };

    const leaveChannel = async () => {
        try {
            tracksRef.current.forEach((track) => {
                track.stop();
                track.close();
            });
            tracksRef.current = [];
            setLocalAudioTrack(null);
            setLocalVideoTrack(null);
            await client.leave();
            setRemoteUsers([]);
            console.log("[Agora] Left channel and cleaned up tracks");
        } catch (err) {
            console.error("[Agora] Error leaving channel:", err);
        }
    };

    // Setup remote user listeners
    const setupListeners = () => {
        client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            console.log(`[Agora] Remote user ${user.uid} published ${mediaType}`);

            if (mediaType === "video") {
                setRemoteUsers((prev) => {
                    if (prev.find((u) => u.uid === user.uid)) return prev;
                    return [...prev, user];
                });
            }

            if (mediaType === "audio") {
                user.audioTrack.play();
            }
        });

        client.on("user-unpublished", (user) => {
            console.log(`[Agora] Remote user ${user.uid} unpublished`);
        });

        client.on("user-left", (user) => {
            console.log(`[Agora] Remote user ${user.uid} left`);
            setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        });
    };

    return (
        <AgoraContext.Provider
            value={{
                client,
                localVideoTrack,
                localAudioTrack,
                remoteUsers,
                joinChannel,
                leaveChannel,
                setupListeners,
            }}
        >
            {children}
        </AgoraContext.Provider>
    );
};

export const useAgora = () => useContext(AgoraContext);
