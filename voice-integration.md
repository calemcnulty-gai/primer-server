# Voice Integration API Guide

This document describes how to implement the server-side WebRTC API for voice communication with the Primer app.

## Overview

The voice API endpoint handles WebRTC connections from the mobile app, processes audio streams in real-time, and returns spoken responses. The connection is maintained through a WebSocket at `/api/v1/voice` for continuous bidirectional communication.

## Technical Requirements

- ExpressJS server with WebSocket support
- WebRTC signaling server implementation
- Real-time audio processing capability

## API Endpoint

```
wss://primer.calemcnulty.com/api/v1/voice
```

## Protocol

The communication between client and server is based on WebRTC signaling protocol over WebSockets. Messages are exchanged as JSON objects.

### Message StructureW

All messages should follow this format:
```json
{
  "type": "message-type",
  "data": {} // Optional data specific to the message type
}
```

## Connection Lifecycle

### 1. Connection Establishment

1. Client connects to the WebSocket endpoint
2. Server accepts connection and waits for client signaling

### 2. Signaling Exchange

#### WebRTC Offer (Client -> Server)
```json
{
  "type": "offer",
  "sdp": {
  }
}
```

#### WebRTC Answer (Server -> Client)
```json
{
  "type": "answer",
  "sdp": {
    // SDP data from RTCPeerConnection.createAnswer()
  }
}
```

#### ICE Candidate Exchange (Both directions)
```json
{
  "type": "ice-candidate",
  "candidate": {
    // ICE candidate data
  }
}
```

### 3. Voice Interaction Control

#### Start Listening (Client -> Server)
```json
{
  "type": "start-listening"
}
```

#### Stop Listening (Client -> Server)
```json
{
  "type": "stop-listening"
}
```

#### Speaking State Updates (Server -> Client)
```json
{
  "type": "speaking-start"
}
```

```json
{
  "type": "speaking-end"
}
```

## Error Handling

### Error Message (Server -> Client)
```json
{
  "type": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

Common error codes:
- `CONNECTION_FAILED`: WebRTC connection could not be established
- `AUTH_FAILED`: Authentication failed
- `INTERNAL_ERROR`: Server-side error occurred
- `MEDIA_ERROR`: Media stream processing error

## Implementation Notes

### ExpressJS Setup

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('wrtc');

// Setup Express
const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebRTC connections map
const connections = new Map();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  // Create a unique ID for this connection
  const connectionId = generateUniqueId();
  
  // Setup peer connection
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  
  // Store connection
  connections.set(connectionId, {
    ws,
    peerConnection,
    // Add any other state needed for this connection
  });
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(connectionId, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  // Handle WebSocket closure
  ws.on('close', () => {
    cleanupConnection(connectionId);
  });
});

// Start the server
server.listen(3001, () => {
  console.log('Voice API server running on port 3001 at path /api/v1/voice');
});
```

### Message Handler Example

```javascript
async function handleMessage(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  const { ws, peerConnection } = connection;
  
  switch (message.type) {
    case 'offer':
      // Handle WebRTC offer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Send answer back to client
      ws.send(JSON.stringify({
        type: 'answer',
        sdp: peerConnection.localDescription
      }));
      break;
      
    case 'ice-candidate':
      // Add ICE candidate
      await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      break;
      
    case 'start-listening':
      // Start processing audio from the connected peer
      // Implementation depends on your audio processing requirements
      beginAudioProcessing(connectionId);
      break;
      
    case 'stop-listening':
      // Stop processing audio
      stopAudioProcessing(connectionId);
      break;
      
    default:
      console.warn('Unknown message type:', message.type);
  }
}
```

## Security Considerations

1. **Authentication**: Implement token-based authentication for WebSocket connections
2. **Data Encryption**: Ensure all WebRTC traffic is encrypted
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Connection Timeouts**: Close inactive connections after a period of inactivity

## Testing the API

You can test the WebSocket API using tools like wscat:

```bash
wscat -c wss://primer.calemcnulty.com/api/v1/voice
```

Or test the entire WebRTC flow using a browser-based client that connects to your API endpoint.

## Example Flow

1. Client establishes WebSocket connection to `/api/v1/voice`
2. Client creates WebRTC peer connection and sends offer
3. Server responds with WebRTC answer
4. Both exchange ICE candidates until connection is established
5. Client sends `start-listening` message
6. Server processes incoming audio and sends audio response
7. Server sends `speaking-start` when beginning to send audio response
8. Server sends `speaking-end` when finished sending audio response
9. Client sends `stop-listening` to end the interaction
10. WebSocket connection remains open for future interactions

## Error Recovery

If the WebRTC connection fails:
1. Client should attempt to reconnect with a new WebSocket connection
2. Connection attempt should back off exponentially if repeated failures occur
3. Client should notify the user of connection issues if persistent

## Performance Considerations

1. Optimize WebRTC settings for voice-only communication (disable video tracks)
2. Configure appropriate audio quality settings (sample rate, bit depth)
3. Consider implementing server-side echo cancellation and noise reduction
4. Monitor server resource usage during active connections