import { Request, Response } from 'express';
import { VoiceController } from '../voiceController';
import { VoiceService } from '../../services/VoiceService';

describe('VoiceController', () => {
  let voiceController: VoiceController;
  let voiceService: VoiceService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;

  beforeEach(() => {
    // Create mock request and response
    mockRequest = {};
    responseJson = jest.fn();
    mockResponse = {
      json: responseJson,
    };

    // Create a mock voice service
    voiceService = new VoiceService();
    
    // Mock the service methods
    jest.spyOn(voiceService, 'getStatus').mockReturnValue('running');
    jest.spyOn(voiceService, 'getRTCConfig').mockReturnValue({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    jest.spyOn(voiceService, 'handleNewConnection').mockImplementation(() => {});

    // Create the controller with the mock service
    voiceController = new VoiceController(voiceService);
  });

  describe('getStatus', () => {
    it('should return the voice service status', () => {
      // Call the method
      voiceController.getStatus(mockRequest as Request, mockResponse as Response);

      // Verify the service method was called
      expect(voiceService.getStatus).toHaveBeenCalled();

      // Verify the response was sent
      expect(responseJson).toHaveBeenCalledWith({
        status: 'running',
        ready: true
      });
    });
  });

  describe('getConfig', () => {
    it('should return the WebRTC configuration', () => {
      // Call the method
      voiceController.getConfig(mockRequest as Request, mockResponse as Response);

      // Verify the service method was called
      expect(voiceService.getRTCConfig).toHaveBeenCalled();

      // Verify the response was sent
      expect(responseJson).toHaveBeenCalledWith({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
    });
  });

  describe('handleWebSocketConnection', () => {
    it('should handle a new WebSocket connection', () => {
      // Mock WebSocket
      const mockWs = {};
      const connectionId = 'test-connection-id';

      // Call the method
      voiceController.handleWebSocketConnection(connectionId, mockWs);

      // Verify the service method was called with the connection ID and WebSocket
      expect(voiceService.handleNewConnection).toHaveBeenCalledWith(connectionId, mockWs);
    });
  });
});