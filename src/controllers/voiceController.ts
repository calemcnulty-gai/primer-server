import { Request, Response } from 'express';
import { VoiceService } from '../services/VoiceService';

export interface VoiceControllerInterface {
  getStatus: (req: Request, res: Response) => void;
  getConfig: (req: Request, res: Response) => void;
  handleWebSocketConnection: (connectionId: string, ws: any) => void;
}

export class VoiceController implements VoiceControllerInterface {
  private voiceService: VoiceService;

  constructor(voiceService: VoiceService) {
    this.voiceService = voiceService;
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
    const config = this.voiceService.getRTCConfig();
    res.json(config);
  }

  /**
   * Handle a new WebSocket connection for voice
   */
  public handleWebSocketConnection(connectionId: string, ws: any): void {
    this.voiceService.handleNewConnection(connectionId, ws);
  }
}