import { Request, Response } from 'express';
import { VoiceService } from '../services/VoiceService';
import { MediasoupService } from '../services/MediasoupService';
import { createLogger } from '../utils/logger';
import { WebSocket } from 'ws';

const logger = createLogger('VoiceController');

export interface VoiceControllerInterface {
  getStatus: (req: Request, res: Response) => void;
  getConfig: (req: Request, res: Response) => void;
  handleWebSocketConnection: (connectionId: string, ws: WebSocket) => void;
}

export class VoiceController implements VoiceControllerInterface {
  private voiceService: VoiceService;
  private mediasoupService: MediasoupService;

  constructor(voiceService: VoiceService, mediasoupService: MediasoupService) {
    this.voiceService = voiceService;
    this.mediasoupService = mediasoupService;
    
    this.getStatus = this.getStatus.bind(this);
    this.getConfig = this.getConfig.bind(this);
    this.handleWebSocketConnection = this.handleWebSocketConnection.bind(this);
  }

  /**
   * Get the status of the voice service
   */
  public getStatus(req: Request, res: Response): void {
    const status = this.voiceService.getStatus();
    res.json({ status, ready: status === 'running' });
  }

  /**
   * Get WebRTC configuration
   */
  public async getConfig(req: Request, res: Response): Promise<void> {
    try {
      // For mediasoup, we don't need to provide STUN/TURN servers as it handles routing
      const config = {
        iceServers: []
      };
      res.json({ config });
    } catch (error) {
      logger.error('Error getting WebRTC config:', error);
      res.status(500).json({ error: 'Failed to get WebRTC configuration' });
    }
  }

  /**
   * Handle new WebSocket connection
   */
  public async handleWebSocketConnection(connectionId: string, ws: WebSocket): Promise<void> {
    try {
      logger.info(`New WebSocket connection: ${connectionId}`);
      await this.mediasoupService.handleConnection(connectionId, ws);
    } catch (error) {
      logger.error(`Error handling WebSocket connection ${connectionId}:`, error);
      ws.close();
    }
  }
}