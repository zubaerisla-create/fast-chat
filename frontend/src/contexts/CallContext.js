import React, { createContext, useContext, useState, useEffect } from "react";

const CallContext = createContext();

export const CALL_STATUS = {
    IDLE: "IDLE",
    INCOMING: "INCOMING",
    OUTGOING: "OUTGOING",
    ONGOING: "ONGOING",
};

export const CallProvider = ({ children }) => {
    const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);
    const [callData, setCallData] = useState(null); // { channelName, callerId, receiverId, callType, callerName, token, uid, appId }

    const resetCall = () => {
        setCallStatus(CALL_STATUS.IDLE);
        setCallData(null);
        console.log("[CallContext] Call reset to IDLE");
    };

    const initiateCall = (data) => {
        setCallData(data);
        setCallStatus(CALL_STATUS.OUTGOING);
        console.log("[CallContext] Outgoing call initiated", data);
    };

    const receiveCall = (data) => {
        setCallData(data);
        setCallStatus(CALL_STATUS.INCOMING);
        console.log("[CallContext] Incoming call received", data);
    };

    const acceptCall = (data) => {
        setCallData((prev) => ({ ...prev, ...data }));
        setCallStatus(CALL_STATUS.ONGOING);
        console.log("[CallContext] Call accepted", data);
    };

    return (
        <CallContext.Provider
            value={{
                callStatus,
                callData,
                initiateCall,
                receiveCall,
                acceptCall,
                resetCall,
            }}
        >
            {children}
        </CallContext.Provider>
    );
};

export const useCall = () => useContext(CallContext);
