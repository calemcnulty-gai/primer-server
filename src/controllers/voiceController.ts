import { Request, Response } from 'express';
import { VoiceService } from '../services/VoiceService';
import { WebRTCService } from '../services/WebRTCService';

export interface VoiceControllerInterface {
  getStatus: (req: Request, res: Response) => void;
  getConfig: (req: Request, res: Response) => void;
  handleWebSocketConnection: (connectionId: string, ws: any) => void;
}

export class VoiceController implements VoiceControllerInterface {
  private voiceService: VoiceService;
  private webrtcService: WebRTCService;

  constructor(voiceService: VoiceService, webrtcService?: WebRTCService) {
    this.voiceService = voiceService;
    
    // Get the WebRTC service either from the parameter or from the import
    // This ensures backward compatibility
    this.webrtcService = webrtcService || (voiceService as any).webrtcService;
    
    if (!this.webrtcService) {
      throw new Error('WebRTCService is required but not available');
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
    const config = this.webrtcService.getRTCConfig();
    res.json(config);
  }

  /**
   * Handle a new WebSocket connection for voice
   */
  public handleWebSocketConnection(connectionId: string, ws: any): void {
    this.webrtcService.handleNewConnection(connectionId, ws);
  }
}