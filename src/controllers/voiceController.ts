import { Request, Response } from 'express';
import { VoiceService } from '../services/VoiceService';
import { MediasoupService } from '../services/MediasoupService';

export interface VoiceControllerInterface {
  getStatus: (req: Request, res: Response) => void;
  getConfig: (req: Request, res: Response) => void;
  handleWebSocketConnection: (connectionId: string, ws: any) => void;
}

export class VoiceController implements VoiceControllerInterface {
  private voiceService: VoiceService;
  private mediasoupService: MediasoupService;

  constructor(voiceService: VoiceService, mediasoupService?: MediasoupService) {
    this.voiceService = voiceService;
    
    // Get the MediasoupService either from the parameter or from the import
    this.mediasoupService = mediasoupService || (voiceService as any).mediasoupService;
    
    if (!this.mediasoupService) {
      throw new Error('MediasoupService is required but not available');
    }
    
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
   * Get WebRTC connection configuration
   */
  public getConfig(req: Request, res: Response): void {
    const config = this.mediasoupService.getRTCConfig();
    res.json(config);
  }

  /**
   * Handle a new WebSocket connection for voice
   */
  public handleWebSocketConnection(connectionId: string, ws: any): void {
    this.mediasoupService.handleConnection(connectionId, ws);
  }
}