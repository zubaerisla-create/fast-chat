import React, { useEffect, useRef } from "react";
import { useCall, CALL_STATUS } from "../contexts/CallContext";
import useAgoraCall from "../hooks/useAgora";

const VideoCall = ({ socket }) => {
    const { callStatus, callData, resetCall } = useCall();
    const { remoteUsers, localVideoTrack } = useAgoraCall();
    const localContainerRef = useRef(null);

    useEffect(() => {
        if (localVideoTrack && localContainerRef.current) {
            localVideoTrack.play(localContainerRef.current);
        }
        return () => {
            if (localVideoTrack) localVideoTrack.stop();
        };
    }, [localVideoTrack]);

    if (callStatus !== CALL_STATUS.ONGOING && callStatus !== CALL_STATUS.OUTGOING) return null;

    const handleEndCall = () => {
        console.log("[UI] Ending call...");
        socket.emit("call_ended", {
            otherUserId: callData.callerId || callData.receiverId,
            channelName: callData.channelName,
        });
        resetCall();
    };

    return (
        <div className="fixed inset-0 bg-slate-900 z-40 flex flex-col">
            <div className="flex-1 relative flex items-center justify-center p-4">
                {/* Remote Video */}
                {remoteUsers.length > 0 ? (
                    <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-800">
                        <RemoteVideoPlayer user={remoteUsers[0]} />
                    </div>
                ) : (
                    <div className="text-white text-center">
                        <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <span className="text-4xl">👤</span>
                        </div>
                        <h3 className="text-xl font-semibold">
                            {callStatus === CALL_STATUS.OUTGOING ? "Calling..." : "Waiting for remote user..."}
                        </h3>
                    </div>
                )}

                {/* Local Video Preview */}
                {callData?.callType === "video" && (
                    <div
                        ref={localContainerRef}
                        className="absolute bottom-24 right-8 w-48 h-32 bg-slate-700 rounded-xl border-2 border-slate-600 shadow-xl overflow-hidden"
                    >
                        {!localVideoTrack && <div className="flex items-center justify-center h-full text-slate-400">Loading...</div>}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="h-24 bg-slate-800/80 backdrop-blur-md flex items-center justify-center gap-8 px-8">
                <button className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition">
                    🎤
                </button>
                <button
                    onClick={handleEndCall}
                    className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition shadow-lg"
                >
                    <span className="text-2xl transform rotate-135">📞</span>
                </button>
                <button className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition">
                    📹
                </button>
            </div>
        </div>
    );
};

const RemoteVideoPlayer = ({ user }) => {
    const containerRef = useRef(null);

    useEffect(() => {
        if (user.videoTrack && containerRef.current) {
            user.videoTrack.play(containerRef.current);
        }
        return () => {
            if (user.videoTrack) user.videoTrack.stop();
        };
    }, [user]);

    return <div ref={containerRef} className="w-full h-full" />;
};

export default VideoCall;
