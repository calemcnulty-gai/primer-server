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
    return !!(connection && connection.connected && connection.peer && connection.peer.connected);
  }
  
  /**
   * Handle WebSocket messages (signaling only)
   */
  private handleWebSocketMessage(connectionId: string, message: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    try {
      const data = JSON.parse(message);
      
      // Forward client messages to listeners
      this.emit('message', connectionId, data);
      
      // Handle WebRTC signaling
      switch (data.type) {
        case 'offer':
          this.handleRTCOffer(connectionId, data);
          break;
          
        case 'ice-candidate':
          this.handleICECandidate(connectionId, data);
          break;
          
        case 'heartbeat':
        case 'ping':
          this.sendMessage(connectionId, { 
            type: data.type === 'heartbeat' ? 'heartbeat-ack' : 'pong' 
          });
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
      
      // Create a new peer connection
      const peer = new SimplePeer({
        initiator: false,
        trickle: true,
        config: { iceServers: this.iceServers },
        sdpTransform: (sdp) => sdp.replace('a=recvonly', 'a=sendrecv'),
        wrtc: require('wrtc')
      });
      
      connection.peer = peer;
      
      // Set up peer event handlers
      peer.on('signal', (signalData: any) => {
        // Send signaling data back via WebSocket
        this.sendMessage(connectionId, signalData);
      });
      
      peer.on('connect', () => {
        logger.info(`WebRTC connection established for ${connectionId}`);
        connection.state = 'connected';
        connection.connected = true;
        
        // Notify that the connection is ready
        this.emit('connection:ready', connectionId);
      });
      
      peer.on('data', (chunk: Buffer) => {
        // Forward received data to listeners
        this.emit('data', connectionId, chunk);
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
    if (!connection || !connection.peer) return;
    
    try {
      connection.peer.signal(data);
    } catch (error) {
      logger.error(`Failed to process ICE candidate from ${connectionId}:`, error);
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
      connection.ws.send(JSON.stringify(message));
      connection.messagesSent++;
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