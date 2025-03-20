# Voice API Client Example

This document provides an example of how to implement a client for the Voice API using WebRTC.

## Prerequisites

- A modern browser with WebRTC support
- Basic understanding of JavaScript and WebRTC concepts

## Example Client Implementation

```javascript
// Voice API Client Example

class VoiceClient {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.ws = null;
    this.peerConnection = null;
    this.localStream = null;
    this.isConnected = false;
    this.isListening = false;
    
    // Callbacks
    this.onSpeakingStart = null;
    this.onSpeakingEnd = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }
  
  /**
   * Initialize the voice client
   */
  async initialize() {
    try {
      // Fetch WebRTC configuration
      const response = await fetch(`${this.apiBaseUrl}/voice/config`);
      const config = await response.json();
      
      // Create WebRTC peer connection with the server's ICE servers
      this.peerConnection = new RTCPeerConnection({
        iceServers: config.iceServers
      });
      
      // Setup event handlers for the peer connection
      this.setupPeerConnectionHandlers();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize voice client:', error);
      if (this.onError) {
        this.onError('INIT_FAILED', error.message);
      }
      return false;
    }
  }
  
  /**
   * Setup WebRTC peer connection event handlers
   */
  setupPeerConnectionHandlers() {
    // Handle ICE candidate events
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendWebSocketMessage({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };
    
    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('RTC Connection state:', this.peerConnection.connectionState);
      
      if (this.peerConnection.connectionState === 'connected') {
        console.log('RTC connection established!');
        this.isConnected = true;
        if (this.onConnect) {
          this.onConnect();
        }
      } else if (this.peerConnection.connectionState === 'failed' || 
                this.peerConnection.connectionState === 'closed') {
        this.isConnected = false;
        if (this.onDisconnect) {
          this.onDisconnect(this.peerConnection.connectionState);
        }
      }
    };
    
    // Handle remote track (receive audio from server)
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      
      // Create an audio element to play the remote audio
      const audioElement = document.createElement('audio');
      audioElement.autoplay = true;
      audioElement.srcObject = new MediaStream([event.track]);
      
      // Append to document (can be hidden if needed)
      document.body.appendChild(audioElement);
    };
  }
  
  /**
   * Connect to the voice API server
   */
  async connect() {
    try {
      // First check if the voice service is ready
      const statusResponse = await fetch(`${this.apiBaseUrl}/voice/status`);
      const statusData = await statusResponse.json();
      
      if (!statusData.ready) {
        throw new Error(`Voice service not ready: ${statusData.status}`);
      }
      
      // Create WebSocket connection
      this.ws = new WebSocket(`wss://${new URL(this.apiBaseUrl).host}/api/v1/voice`);
      
      // Setup WebSocket event handlers
      this.setupWebSocketHandlers();
      
      return new Promise((resolve, reject) => {
        // Wait for WebSocket to open
        this.ws.onopen = async () => {
          try {
            await this.createAndSendOffer();
            resolve(true);
          } catch (error) {
            reject(error);
          }
        };
        
        // Handle connection errors
        this.ws.onerror = (error) => {
          reject(new Error('WebSocket connection failed'));
        };
      });
    } catch (error) {
      console.error('Failed to connect to voice API:', error);
      if (this.onError) {
        this.onError('CONNECTION_FAILED', error.message);
      }
      return false;
    }
  }
  
  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    // Handle incoming messages
    this.ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    // Handle WebSocket closure
    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
      this.isConnected = false;
      if (this.onDisconnect) {
        this.onDisconnect('websocket_closed');
      }
    };
    
    // Handle WebSocket errors
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (this.onError) {
        this.onError('WEBSOCKET_ERROR', 'WebSocket connection error');
      }
    };
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  async handleWebSocketMessage(message) {
    switch (message.type) {
      case 'answer':
        // Handle WebRTC answer from server
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
        console.log('Set remote description from answer');
        break;
        
      case 'ice-candidate':
        // Add ICE candidate from server
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        console.log('Added ICE candidate from server');
        break;
        
      case 'speaking-start':
        // Server has started speaking
        console.log('Server started speaking');
        if (this.onSpeakingStart) {
          this.onSpeakingStart();
        }
        break;
        
      case 'speaking-end':
        // Server has stopped speaking
        console.log('Server stopped speaking');
        if (this.onSpeakingEnd) {
          this.onSpeakingEnd();
        }
        break;
        
      case 'error':
        // Handle error from server
        console.error('Server error:', message.error);
        if (this.onError) {
          this.onError(message.error.code, message.error.message);
        }
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  }
  
  /**
   * Create and send WebRTC offer to server
   */
  async createAndSendOffer() {
    try {
      // Get access to user's microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Add local audio tracks to peer connection
      this.localStream.getAudioTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      // Send offer to server
      this.sendWebSocketMessage({
        type: 'offer',
        sdp: this.peerConnection.localDescription
      });
      
      console.log('Sent offer to server');
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }
  
  /**
   * Start listening (begin voice interaction)
   */
  startListening() {
    if (!this.isConnected) {
      console.error('Cannot start listening: not connected');
      return false;
    }
    
    this.isListening = true;
    this.sendWebSocketMessage({
      type: 'start-listening'
    });
    console.log('Started listening');
    return true;
  }
  
  /**
   * Stop listening (end voice interaction)
   */
  stopListening() {
    if (!this.isListening) {
      return false;
    }
    
    this.isListening = false;
    this.sendWebSocketMessage({
      type: 'stop-listening'
    });
    console.log('Stopped listening');
    return true;
  }
  
  /**
   * Disconnect from the voice API
   */
  disconnect() {
    // Stop listening if needed
    if (this.isListening) {
      this.stopListening();
    }
    
    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    // Close WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    // Stop local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    this.isConnected = false;
    this.isListening = false;
    console.log('Disconnected from voice API');
  }
  
  /**
   * Send a message through the WebSocket
   */
  sendWebSocketMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message: WebSocket not open');
    }
  }
}

// Usage example:
async function main() {
  const voiceClient = new VoiceClient('https://primer.calemcnulty.com/api/v1');
  
  // Set up event handlers
  voiceClient.onConnect = () => {
    console.log('Connected to voice API!');
    // Start listening automatically on connect
    voiceClient.startListening();
  };
  
  voiceClient.onDisconnect = (reason) => {
    console.log('Disconnected from voice API:', reason);
  };
  
  voiceClient.onError = (code, message) => {
    console.error(`Voice API error [${code}]:`, message);
  };
  
  voiceClient.onSpeakingStart = () => {
    console.log('Server started speaking...');
    // Update UI to show server is speaking
  };
  
  voiceClient.onSpeakingEnd = () => {
    console.log('Server finished speaking');
    // Update UI to show server is not speaking
  };
  
  // Initialize and connect
  await voiceClient.initialize();
  await voiceClient.connect();
  
  // Example: Disconnect after 60 seconds
  setTimeout(() => {
    voiceClient.disconnect();
  }, 60000);
}

// Call main function to start
main().catch(error => {
  console.error('Main error:', error);
});
```

## Integration Steps

1. **Check Service Status**: Before attempting to connect, check if the voice service is ready:
   ```javascript
   const response = await fetch('https://primer.calemcnulty.com/api/v1/voice/status');
   const data = await response.json();
   if (data.ready) {
     // Proceed with connection
   }
   ```

2. **Get WebRTC Configuration**: Retrieve ICE servers and other WebRTC configuration:
   ```javascript
   const configResponse = await fetch('https://primer.calemcnulty.com/api/v1/voice/config');
   const config = await configResponse.json();
   ```

3. **Establish WebSocket Connection**: Connect to the WebSocket endpoint:
   ```javascript
   const ws = new WebSocket('wss://primer.calemcnulty.com/api/v1/voice');
   ```

4. **WebRTC Signaling Exchange**: Exchange WebRTC offer/answer and ICE candidates with the server.

5. **Voice Interaction**: Use `start-listening` and `stop-listening` messages to control the interaction.

## Error Handling

- Always check the service status before attempting to connect
- Implement exponential backoff for reconnection attempts
- Handle all WebSocket and WebRTC error events
- Present user-friendly error messages to the app user

## Mobile App Integration Notes

When integrating with the Primer mobile app:

1. **Permission Handling**: Ensure proper microphone permission requesting and handling
2. **Background Mode**: Manage voice connections properly when the app moves to the background
3. **Network Changes**: Handle network transitions (Wi-Fi to cellular, etc.)
4. **Battery Optimization**: Close connections when not actively used to conserve battery

## Testing

Test your integration with:

1. **Echo Test**: Verify audio is being transmitted in both directions
2. **Network Throttling**: Test with limited bandwidth
3. **Connection Interruption**: Test recovery from temporary network loss
4. **Long-Running Sessions**: Test stability over extended periods