import { VoiceService } from '../VoiceService';

describe('VoiceService', () => {
  let voiceService: VoiceService;
  let mockWs: any;

  beforeEach(() => {
    // Create a new voice service instance
    voiceService = new VoiceService();

    // Create a mock WebSocket
    mockWs = {
      send: jest.fn(),
      on: jest.fn()
    };
  });

  describe('getStatus', () => {
    it('should return the service status', () => {
      // Mock the private status property
      (voiceService as any).status = 'running';

      // Call the method
      const status = voiceService.getStatus();

      // Verify the result
      expect(status).toBe('running');
    });
  });

  describe('getRTCConfig', () => {
    it('should return the WebRTC configuration', () => {
      // Mock the private iceServers property
      (voiceService as any).iceServers = [
        { urls: 'stun:stun.example.com:19302' }
      ];

      // Call the method
      const config = voiceService.getRTCConfig();

      // Verify the result
      expect(config).toEqual({
        iceServers: [{ urls: 'stun:stun.example.com:19302' }]
      });
    });
  });

  describe('handleNewConnection', () => {
    it('should set up a new connection', () => {
      // Call the method
      voiceService.handleNewConnection('test-connection', mockWs);

      // Verify the WebSocket event handlers were set up
      expect(mockWs.on).toHaveBeenCalledTimes(3);
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));

      // Verify the connection was stored
      expect((voiceService as any).connections.has('test-connection')).toBe(true);
      
      const connection = (voiceService as any).connections.get('test-connection');
      expect(connection.ws).toBe(mockWs);
      expect(connection.state).toBe('new');
      expect(connection.isListening).toBe(false);
      expect(connection.lastActivity).toBeGreaterThan(0);
    });
  });
});