import { EventEmitter } from 'events';
import SimplePeer from 'simple-peer';
import { createLogger } from '../utils/logger';

const logger = createLogger('WebRTCService');

// Connection state for a WebRTC peer
export interface RTCConnectionState {
  id: string;              // Unique connection ID
  ws: any;                 // WebSocket connection (used only for signaling)
  peer?: any;              // SimplePeer instance
  state: 'new' | 'connecting' | 'connected' | 'failed' | 'closed';
  lastActivity: number;    // Timestamp of last activity
  messagesReceived: number;
  messagesSent: number;
  statsInterval?: NodeJS.Timeout;
  connected: boolean;      // Whether the WebRTC connection is active
  keepAliveInterval?: NodeJS.Timeout;
  pendingCandidates?: any[];
}

export interface WebRTCMessage {
  type: string;
  [key: string]: any;
}

// Events emitted by WebRTCService
export interface WebRTCEvents {
  // Connection lifecycle events
  'connection:new': (connectionId: string) => void;
  'connection:ready': (connectionId: string) => void;
  'connection:closed': (connectionId: string) => void;
  
  // Data events
  'data': (connectionId: string, data: Buffer) => void;
  
  // Message events
  'message': (connectionId: string, message: WebRTCMessage) => void;
  
  // Error events
  'error': (connectionId: string, code: string, message: string) => void;
}

export class WebRTCService extends EventEmitter {
  private connections: Map<string, RTCConnectionState>;
  private iceServers: Array<{ urls: string }>;
  private status: 'initializing' | 'running' | 'error';
  
  constructor() {
    super();
    this.connections = new Map();
    this.status = 'initializing';
    
    // Standard STUN servers
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];
    
    logger.info('WebRTC service created with STUN servers initialized');
    this.initialize();
  }
  
  /**
   * Initialize the WebRTC service
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing WebRTC service...');
      this.status = 'running';
      logger.info('WebRTC service initialized and ready to accept connections');
    } catch (error) {
      this.status = 'error';
      logger.error('WebRTC service initialization failed:', error);
    }
  }
  
  /**
   * Get the current status of the WebRTC service
   */
  public getStatus(): string {
    return this.status;
  }
  
  /**
   * Get the WebRTC configuration for clients
   */
  public getRTCConfig(): { iceServers: Array<{ urls: string }> } {
    return { iceServers: this.iceServers };
  }
  
  /**
   * Handle a new WebSocket connection (used only for WebRTC signaling)
   */
  public handleNewConnection(connectionId: string, ws: any): void {
    logger.info(`New WebSocket connection received: ${connectionId}`);
    
    // Create a new connection state object
    const connection: RTCConnectionState = {
      id: connectionId,
      ws,
      state: 'new',
      lastActivity: Date.now(),
      messagesReceived: 0,
      messagesSent: 0,
      connected: false
    };
    
    // Store the connection
    this.connections.set(connectionId, connection);
    
    // Set up WebSocket message handler - for signaling only
    ws.on('message', (message: any) => {
      connection.messagesReceived++;
      connection.lastActivity = Date.now();
      
      // Only handle text messages for signaling
      if (typeof message === 'string' || message instanceof String) {
        this.handleWebSocketMessage(connectionId, message.toString());
      } else if (message instanceof Buffer) {
        try {
          // Try to parse as JSON for signaling
          const textMessage = message.toString('utf8');
          if (textMessage.startsWith('{') && textMessage.includes('"type"')) {
            this.handleWebSocketMessage(connectionId, textMessage);
          } else {
            logger.debug(`Ignoring binary data over WebSocket - WebRTC should be used for audio`);
          }
        } catch (e) {
          logger.debug(`Ignoring non-JSON binary data over WebSocket`);
        }
      }
    });
    
    // Set up WebSocket close handler
    ws.on('close', () => {
      this.handleConnectionClosed(connectionId);
    });
    
    // Set up WebSocket error handler
    ws.on('error', (error: Error) => {
      logger.error(`WebSocket error for ${connectionId}:`, error);
      this.sendError(connectionId, 'CONNECTION_FAILED', 'WebSocket connection error');
    });
    
    // Send connection-ready message
    this.sendMessage(connectionId, { type: 'connection-ready' });
    
    // Set up stats logging
    const statsInterval = setInterval(() => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        logger.info(`Stats for ${connectionId}: State=${conn.state}, WebRTC=${conn.connected ? 'connected' : 'disconnected'}`);
      } else {
        clearInterval(statsInterval);
      }
    }, 30000);
    
    connection.statsInterval = statsInterval;
    
    // Emit connection event
    this.emit('connection:new', connectionId);
  }
  
  /**
   * Get all active connection IDs
   */
  public getConnections(): string[] {
    return Array.from(this.connections.keys());
  }
  
  /**
   * Check if a connection is established
   */
  public isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    
    // Enhanced logging to debug connection state issues
    if (connection) {
      const peerState = connection.peer?._pc?.connectionState || 'unknown';
      const iceState = connection.peer?._pc?.iceConnectionState || 'unknown';
      
      // Debug logging for connection state checks (for troubleshooting only)
      logger.debug(`Connection check for ${connectionId}: internal=${connection.state}, connected=${connection.connected}, peer=${peerState}, ice=${iceState}`);
      
      // Simplified connection check focused on peer connection
      return connection.connected && connection.peer && (
        // Check both connection state and ice connection state
        (peerState === 'connected' || iceState === 'connected' || iceState === 'completed')
      );
    }
    
    return false;
  }
  
  /**
   * Get the peer connection object for debugging
   */
  public getPeerConnection(connectionId: string): any {
    const connection = this.connections.get(connectionId);
    return connection?.peer?._pc || null;
  }
  
  /**
   * Handle WebSocket messages (signaling only)
   */
  private handleWebSocketMessage(connectionId: string, message: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Always update the last activity timestamp for any message
    connection.lastActivity = Date.now();
    
    try {
      const data = JSON.parse(message);
      
      // Enhanced debugging for all messages
      if (data.type !== 'ping' && data.type !== 'heartbeat') {
        logger.info(`WebSocket message received from ${connectionId}: type=${data.type}, size=${message.length}`);
      } else {
        // Just log heartbeats and pings at debug level
        logger.debug(`WebSocket heartbeat received from ${connectionId}: type=${data.type}`);
      }
      
      // Forward client messages to listeners (except for pings/heartbeats)
      if (data.type !== 'ping' && data.type !== 'heartbeat') {
        this.emit('message', connectionId, data);
      }
      
      // Handle WebRTC signaling
      switch (data.type) {
        case 'offer':
          this.handleRTCOffer(connectionId, data);
          break;
          
        case 'ice-candidate':
          this.handleICECandidate(connectionId, data);
          break;
          
        case 'start-listening':
          // Explicitly log start-listening commands at info level
          logger.info(`Received start-listening command from ${connectionId} with ID: ${data.commandId || 'none'}`);
          break;
          
        case 'heartbeat':
        case 'ping':
          // Always respond to heartbeats and pings immediately to keep connection alive
          this.sendMessage(connectionId, { 
            type: data.type === 'heartbeat' ? 'heartbeat-ack' : 'pong',
            timestamp: Date.now()
          });
          break;
          
        default:
          logger.debug(`Unhandled message type: ${data.type} from ${connectionId}`);
          break;
      }
    } catch (error) {
      logger.error(`Error processing message from ${connectionId}:`, error);
      this.sendError(connectionId, 'INTERNAL_ERROR', 'Error processing message');
    }
  }
  
  /**
   * Handle WebRTC offer from client
   */
  private handleRTCOffer(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    try {
      connection.state = 'connecting';
      
      // Create a new peer connection with proper configuration
      const peer = new SimplePeer({
        initiator: false,
        trickle: true,
        config: { iceServers: this.iceServers },
        objectMode: true, // Enable object mode for proper data handling
        sdpTransform: (sdp) => {
          // Ensure proper audio stream configuration
          sdp = sdp.replace('a=recvonly', 'a=sendrecv');
          // Add audio codec preferences for Opus
          if (!sdp.includes('a=fmtp:111')) {
            sdp = sdp.replace('a=rtpmap:111 opus/48000/2\r\n',
              'a=rtpmap:111 opus/48000/2\r\n' +
              'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1\r\n');
          }
          return sdp;
        },
        wrtc: require('wrtc')
      });
      
      connection.peer = peer;

      // Handle incoming audio tracks
      peer.on('track', (track, stream) => {
        logger.info(`Received audio track for ${connectionId}: kind=${track.kind}, id=${track.id}`);
        
        if (track.kind === 'audio') {
          // Log track details
          logger.info(`Audio track details for ${connectionId}:`, {
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          });

          // Set up direct data handling from the track
          track.on('data', (data: Buffer) => {
            if (!connection.connected) return;
            logger.debug(`Received audio data: size=${data.length} bytes, connectionId=${connectionId}`);
            this.emit('data', connectionId, data);
          });

          track.on('ended', () => {
            logger.info(`Audio track ended for ${connectionId}`);
          });

          track.on('error', (error) => {
            logger.error(`Audio track error for ${connectionId}:`, error);
          });
        }
      });

      // Handle incoming media streams
      peer.on('stream', (stream) => {
        const audioTracks = stream.getAudioTracks();
        logger.info(`Received media stream for ${connectionId}: ${audioTracks.length} audio tracks`);
        
        // Log stream details
        audioTracks.forEach((track, index) => {
          logger.info(`Audio track ${index + 1}/${audioTracks.length} for ${connectionId}:`, {
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          });
        });
      });
      
      // Set up peer event handlers
      peer.on('signal', (signalData: any) => {
        // Send signaling data back via WebSocket
        this.sendMessage(connectionId, signalData);
      });
      
      peer.on('connect', () => {
        logger.info(`WebRTC connection established for ${connectionId}`);
        
        // Check and log the actual ICE connection state
        const iceState = peer._pc?.iceConnectionState || 'unknown';
        const connState = peer._pc?.connectionState || 'unknown';
        logger.info(`WebRTC states for ${connectionId}: ice=${iceState}, connection=${connState}`);
        
        // Update connection state
        connection.state = 'connected';
        connection.connected = true;
        
        // Track connection state inconsistency but don't try to modify read-only property
        if (!peer.connected) {
          logger.warn(`Peer.connected is false for ${connectionId} despite connect event, tracking in our internal state only`);
        }
        
        // Set up keep-alive pings to maintain WebRTC connection
        const keepAliveInterval = setInterval(() => {
          if (connection.connected && peer && peer._pc) {
            try {
              // Send a small keep-alive packet if no data was sent recently
              const timeSinceLastActivity = Date.now() - connection.lastActivity;
              if (timeSinceLastActivity > 5000) {
                logger.debug(`Sending keep-alive for ${connectionId}, ${timeSinceLastActivity}ms since activity`);
                connection.lastActivity = Date.now();
              }
            } catch (pingErr) {
              logger.error(`Error sending keep-alive to ${connectionId}:`, pingErr);
            }
          } else {
            // Stop interval if connection is gone
            clearInterval(keepAliveInterval);
          }
        }, 5000);
        
        // Store interval for cleanup
        connection.keepAliveInterval = keepAliveInterval;
        
        // Notify that the connection is ready
        this.emit('connection:ready', connectionId);
        
        // Send a connection-established message to the client
        this.sendMessage(connectionId, { type: 'connection-established' });
      });
      
      peer.on('error', (err: Error) => {
        logger.error(`WebRTC error for ${connectionId}:`, err);
        connection.connected = false;
        this.sendError(connectionId, 'WEBRTC_ERROR', err.message);
      });
      
      peer.on('close', () => {
        if (connection.state !== 'closed') {
          connection.state = 'closed';
          connection.connected = false;
          
          // Clear keep-alive interval if it exists
          if (connection.keepAliveInterval) {
            clearInterval(connection.keepAliveInterval);
          }
          
          // Emit closed event
          this.emit('connection:closed', connectionId);
        }
      });
      
      // Signal the peer with the offer
      peer.signal(data);
    } catch (error) {
      logger.error(`Failed to process offer from ${connectionId}:`, error);
      this.sendError(connectionId, 'OFFER_PROCESSING_FAILED', 'Could not process WebRTC offer');
      connection.state = 'failed';
    }
  }
  
  /**
   * Handle ICE candidate from client
   */
  private handleICECandidate(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    try {
      // Check if we have a valid peer and it's not destroyed
      if (!connection.peer || connection.peer.destroyed) {
        logger.warn(`Cannot process ICE candidate for ${connectionId}: peer is ${!connection.peer ? 'missing' : 'destroyed'}`);
        
        // If peer is destroyed but we're still getting candidates, attempt recovery
        if (connection.state !== 'closed') {
          logger.info(`Attempting to recover connection for ${connectionId}`);
          // Store the candidate for later if we get a new offer
          if (!connection.pendingCandidates) {
            connection.pendingCandidates = [];
          }
          connection.pendingCandidates.push(data);
          
          // Request a new offer from client
          this.sendMessage(connectionId, { 
            type: 'connection-retry-needed',
            message: 'WebRTC connection failed, please send a new offer'
          });
        }
        return;
      }
      
      // Log ICE candidate for debugging (safely check type)
      if (data.candidate && typeof data.candidate === 'string') {
        logger.debug(`Processing ICE candidate for ${connectionId}: ${data.candidate.substring(0, 50)}...`);
      }
      
      // Signal the peer with the ICE candidate
      connection.peer.signal(data);
      
      // Check connection state after a delay
      setTimeout(() => {
        if (!connection.peer || connection.peer.destroyed) return;
        
        const peerConn = connection.peer._pc;
        if (peerConn && 
           (peerConn.iceConnectionState === 'connected' || peerConn.iceConnectionState === 'completed') && 
           !connection.connected) {
          
          logger.info(`ICE connection state changed to ${peerConn.iceConnectionState} for ${connectionId}, updating connection status`);
          connection.connected = true;
          connection.state = 'connected';
          
          // Process any pending candidates if we recovered
          if (connection.pendingCandidates?.length > 0) {
            logger.info(`Processing ${connection.pendingCandidates.length} pending candidates for ${connectionId}`);
            connection.pendingCandidates.forEach(candidate => {
              try {
                connection.peer.signal(candidate);
              } catch (err) {
                logger.warn(`Failed to process pending candidate: ${err.message}`);
              }
            });
            delete connection.pendingCandidates;
          }
          
          // Emit connection:ready if not already done
          this.emit('connection:ready', connectionId);
        }
      }, 500);
      
    } catch (error) {
      logger.error(`Failed to process ICE candidate from ${connectionId}:`, error);
      
      // Only attempt recovery for non-fatal errors
      if (error.code !== 'ERR_DESTROYED' && connection.state !== 'closed') {
        logger.info(`Will attempt recovery for ${connectionId} on next offer`);
      }
    }
  }
  
  /**
   * Send data to a client over the WebRTC connection
   */
  public sendData(connectionId: string, data: Buffer): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected || !connection.peer || !connection.peer.connected) {
      logger.warn(`Cannot send data: WebRTC not connected for ${connectionId}`);
      return false;
    }
    
    try {
      connection.peer.send(data);
      return true;
    } catch (error) {
      logger.error(`Error sending data to ${connectionId}:`, error);
      return false;
    }
  }
  
  /**
   * Close a specific connection
   */
  public closeConnection(connectionId: string): void {
    this.handleConnectionClosed(connectionId);
  }
  
  /**
   * Handle connection closed
   */
  private handleConnectionClosed(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Log connection state before closing for debugging
    try {
      const peer = connection.peer;
      const peerConn = peer?._pc;
      
      logger.info(`Connection closing for ${connectionId}: 
        State: ${connection.state}, 
        Connected: ${connection.connected ? 'yes' : 'no'}, 
        Peer State: ${peerConn?.connectionState || 'unknown'}, 
        ICE State: ${peerConn?.iceConnectionState || 'unknown'}, 
        Signaling State: ${peerConn?.signalingState || 'unknown'}, 
        Messages Received: ${connection.messagesReceived}, 
        Messages Sent: ${connection.messagesSent},
        Age: ${Date.now() - connection.lastActivity}ms
      `);
    } catch (logErr) {
      logger.error(`Error logging connection state for ${connectionId}:`, logErr);
    }
    
    // Clean up peer connection
    if (connection.peer) {
      try {
        connection.peer.destroy();
      } catch (err) {
        logger.error(`Error destroying peer for ${connectionId}:`, err);
      }
    }
    
    // Clear intervals
    if (connection.statsInterval) {
      clearInterval(connection.statsInterval);
    }
    
    if (connection.keepAliveInterval) {
      clearInterval(connection.keepAliveInterval);
    }
    
    logger.info(`Connection closed: ${connectionId}`);
    this.connections.delete(connectionId);
    
    // Emit closed event
    this.emit('connection:closed', connectionId);
  }
  
  /**
   * Send a message to a connection (via WebSocket, for signaling only)
   */
  public sendMessage(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state === 'closed') return false;
    
    try {
      // For specific message types, add connection status information
      if (message.type === 'listening-started' || 
          message.type === 'connection-established' || 
          message.type === 'voice-session-ready') {
        
        // Add connection metrics to help client troubleshoot
        const peer = connection.peer;
        const peerConn = peer?._pc;
        
        // Add connection status fields
        message.serverConnectionState = {
          internalState: connection.state,
          connected: connection.connected,
          peerState: peerConn?.connectionState,
          iceState: peerConn?.iceConnectionState,
          signalingState: peerConn?.signalingState,
          receivers: peerConn?.getReceivers()?.length || 0,
          timestamp: Date.now()
        };
      }
      
      // Send the message
      connection.ws.send(JSON.stringify(message));
      connection.messagesSent++;
      
      if (message.type !== 'heartbeat-ack' && message.type !== 'pong') {
        logger.debug(`Sent message type ${message.type} to ${connectionId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error sending message to ${connectionId}:`, error);
      return false;
    }
  }
  
  /**
   * Send an error message to a connection
   */
  public sendError(connectionId: string, code: string, message: string): void {
    logger.warn(`Sending error to ${connectionId}: ${code} - ${message}`);
    this.sendMessage(connectionId, {
      type: 'error',
      error: { code, message }
    });
    
    // Emit error event
    this.emit('error', connectionId, code, message);
  }
} 