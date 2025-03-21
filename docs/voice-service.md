# Voice Service Documentation

This document explains how the Voice Service works in the Primer application.

## Overview

The Voice Service provides real-time audio communication between clients and the server. It uses WebRTC for efficient peer-to-peer connections and WebSockets for signaling and fallback audio transmission.

## Key Components

### Voice Service

The main service class, responsible for:
- Managing client connections
- Handling WebRTC signaling
- Processing audio data
- Coordinating the STT -> LLM -> TTS pipeline

### WebRTC Implementation

We use the `simple-peer` library to handle WebRTC connections. This provides:
- Low-latency audio streaming
- ICE candidate negotiation
- Signaling protocol handling

### Audio Processing Pipeline

1. **Speech-to-Text (STT)**: Audio from the client is transcribed using Deepgram
2. **Language Processing**: Text is processed using Gemini LLM
3. **Text-to-Speech (TTS)**: Response is converted to audio using Cartesia
4. **Audio Delivery**: Audio is sent back to the client via WebRTC or WebSocket

## Connection Flow

1. Client establishes WebSocket connection to `/api/v1/voice`
2. Server sends `connection-ready` message
3. Client initiates WebRTC by sending `offer`
4. Server creates WebRTC peer and processes the offer
5. Server sends answer and ICE candidates back through WebSocket
6. Both sides exchange ICE candidates until connection is established
7. Client sends `start-listening` to begin audio capture
8. Audio data flows through established WebRTC connection
9. Client sends `stop-listening` when done recording
10. Server processes audio and sends response back

## Fallback Mechanism

If WebRTC connection fails, the system falls back to using WebSockets for audio transmission. This ensures the service works even in environments where WebRTC might be restricted.

## Audio Format

- Client audio: Raw PCM audio (typically 16-bit, 48kHz, mono)
- Server response: Encoded WAV format audio

## Error Handling

The service handles various error conditions:
- Connection failures
- WebRTC negotiation failures
- Audio processing errors

Error messages are sent to the client with specific error codes to help diagnose issues.

## Monitoring and Logging

Comprehensive logging captures key events:
- Connection lifecycle events
- Audio processing metrics
- Error conditions

Connection statistics are logged every 30 seconds for monitoring purposes.

## Implementation Details

### WebRTC Peer Creation

```typescript
const peer = new SimplePeer({
  trickle: true, 
  config: { iceServers: this.iceServers }
});
```

### ICE Servers Configuration

```typescript
this.iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];
```

### Sending Audio to Client

```typescript
// If WebRTC is connected
if (connection.peer && connection.peer.connected) {
  // Send audio via data channel in chunks
  for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
    const chunk = audioData.slice(i, i + CHUNK_SIZE);
    connection.peer.send(chunk);
  }
} else {
  // Fallback to WebSocket
  connection.ws.send(audioData, { binary: true });
}
``` 