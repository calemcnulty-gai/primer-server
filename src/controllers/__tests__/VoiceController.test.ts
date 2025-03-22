import { Request, Response } from 'express';
import { VoiceController } from '../voiceController';
import { VoiceService } from '../../services/VoiceService';
import { MediasoupService } from '../../services/MediasoupService';
import { jest } from '@jest/globals';
import { WebSocket } from 'ws';

describe('VoiceController', () => {
  let voiceController: VoiceController;
  let voiceService: jest.Mocked<VoiceService>;
  let mediasoupService: jest.Mocked<MediasoupService>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    // Create mock services
    voiceService = {
      startListening: jest.fn(),
      stopListening: jest.fn(),
    } as unknown as jest.Mocked<VoiceService>;

    mediasoupService = {
      handleConnection: jest.fn(),
    } as unknown as jest.Mocked<MediasoupService>;

    // Create mock request and response
    mockReq = {};
    const mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockRes = mockResponse as unknown as Partial<Response>;

    voiceController = new VoiceController(voiceService, mediasoupService);
  });

  describe('getConfig', () => {
    it('should return WebRTC configuration', async () => {
      await voiceController.getConfig(mockReq as Request, mockRes as Response);
      expect(mockRes.json).toHaveBeenCalledWith({
        config: {
          iceServers: []
        }
      });
    });
  });

  describe('handleWebSocketConnection', () => {
    it('should handle new WebSocket connection', async () => {
      const mockWs = {} as WebSocket;
      const connectionId = 'test-connection';

      await voiceController.handleWebSocketConnection(connectionId, mockWs);
      expect(mediasoupService.handleConnection).toHaveBeenCalledWith(connectionId, mockWs);
    });

    it('should handle connection errors', async () => {
      const mockWs = {
        close: jest.fn()
      } as unknown as WebSocket;
      const connectionId = 'test-connection';

      const error = new Error('Connection failed');
      mediasoupService.handleConnection.mockRejectedValue(error);

      await voiceController.handleWebSocketConnection(connectionId, mockWs);
      expect(mockWs.close).toHaveBeenCalled();
    });
  });
});