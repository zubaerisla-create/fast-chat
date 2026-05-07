import React from "react";
import { useCall, CALL_STATUS } from "../contexts/CallContext";

const CallModal = ({ socket }) => {
    const { callStatus, callData, resetCall } = useCall();

    if (callStatus !== CALL_STATUS.INCOMING) return null;

    const handleAccept = () => {
        console.log("[UI] Accepting call...");
        socket.emit("call_accepted", {
            callerId: callData.callerId,
            channelName: callData.channelName,
        });
    };

    const handleReject = () => {
        console.log("[UI] Rejecting call...");
        socket.emit("call_rejected", {
            callerId: callData.callerId,
        });
        resetCall();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-4xl text-blue-600">📞</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Incoming {callData.callType} Call</h2>
                <p className="text-gray-600 mb-6">From {callData.callerName || "Unknown User"}</p>

                <div className="flex gap-4">
                    <button
                        onClick={handleReject}
                        className="px-6 py-3 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition"
                    >
                        Reject
                    </button>
                    <button
                        onClick={handleAccept}
                        className="px-6 py-3 bg-green-500 text-white rounded-full font-bold hover:bg-green-600 transition"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CallModal;
