import { useEffect } from "react";
import { useAgora } from "../contexts/AgoraContext";
import { useCall, CALL_STATUS } from "../contexts/CallContext";

/**
 * High-level hook for managing Agora call lifecycle in the UI
 */
const useAgoraCall = () => {
    const { callStatus, callData, resetCall } = useCall();
    const { joinChannel, leaveChannel, setupListeners, remoteUsers, localVideoTrack } = useAgora();

    useEffect(() => {
        // Setup Agora listeners once
        setupListeners();
    }, [setupListeners]);

    useEffect(() => {
        // Automatically join Agora channel when state moves to ONGOING
        if (callStatus === CALL_STATUS.ONGOING && callData?.token) {
            const { appId, channelName, token, uid, callType } = callData;
            joinChannel(appId, channelName, token, uid, callType);
        }

        // Automatically leave when call is no longer ongoing
        if (callStatus === CALL_STATUS.IDLE) {
            leaveChannel();
        }
    }, [callStatus, callData, joinChannel, leaveChannel]);

    return {
        remoteUsers,
        localVideoTrack,
    };
};

export default useAgoraCall;
