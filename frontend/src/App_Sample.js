import React from "react";
import { io } from "socket.io-client";
import { CallProvider } from "./contexts/CallContext";
import { AgoraProvider } from "./contexts/AgoraContext";
import useSocket from "./hooks/useSocket";
import CallModal from "./components/CallModal";
import VideoCall from "./components/VideoCall";

// Initialize socket
const socket = io("https://fast-chat-nwbp.onrender.com");

function App() {
    // Initialize socket listeners for calling
    useSocket(socket);

    return (
        <AgoraProvider>
            <CallProvider>
                <div className="App">
                    <h1>Messenger Style Call App</h1>

                    {/* Main App Content */}

                    {/* Call UI Components */}
                    <CallModal socket={socket} />
                    <VideoCall socket={socket} />
                </div>
            </CallProvider>
        </AgoraProvider>
    );
}

export default App;
