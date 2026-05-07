import { useEffect } from "react";
import { useCall } from "../contexts/CallContext";

/**
 * Custom hook to manage socket signaling for calls
 * @param {Object} socket - The socket.io client instance
 */
const useSocket = (socket) => {
    const { receiveCall, acceptCall, resetCall } = useCall();

    useEffect(() => {
        if (!socket) return;

        // Handle outgoing call confirmation
        socket.on("call_initiated", (data) => {
            console.log("[Socket] Call initiated confirmation", data);
        });

        // Handle incoming call
        socket.on("incoming_call", (data) => {
            console.log("[Socket] Incoming call event received", data);
            receiveCall(data);
        });

        // Handle call acceptance (from backend with Agora tokens)
        socket.on("acceptCall", (data) => {
            console.log("[Socket] acceptCall event received (Syncing state)", data);
            acceptCall(data);
        });

        // Handle call rejection
        socket.on("call_rejected", (data) => {
            console.log("[Socket] Call rejected by receiver");
            alert("Call rejected");
            resetCall();
        });

        // Handle call end from other party
        socket.on("call_ended", (data) => {
            console.log("[Socket] Call ended event received");
            resetCall();
        });

        return () => {
            socket.off("call_initiated");
            socket.off("incoming_call");
            socket.off("acceptCall");
            socket.off("call_rejected");
            socket.off("call_ended");
        };
    }, [socket, receiveCall, acceptCall, resetCall]);

    return null;
};

export default useSocket;
