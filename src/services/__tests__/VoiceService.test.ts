import { VoiceService } from '../VoiceService';
import { WebRTCService } from '../WebRTCService'; 

describe('VoiceService', () => {
  let voiceService: VoiceService;
  let webrtcService: WebRTCService;

  beforeEach(() => {
    // Create a mock WebRTC service
    webrtcService = {
      on: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn(),
      sendData: jest.fn().mockReturnValue(true),
      sendError: jest.fn()
    } as unknown as WebRTCService;

    // Create a new voice service instance with the mock WebRTC service
    voiceService = new VoiceService(webrtcService);
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

  describe('createSession', () => {
    it('should create a new audio session', () => {
      // Call the private method directly
      (voiceService as any).createSession('test-connection');

      // Verify the session was created
      expect((voiceService as any).sessions.has('test-connection')).toBe(true);
      
      const session = (voiceService as any).sessions.get('test-connection');
      expect(session.connectionId).toBe('test-connection');
      expect(session.isListening).toBe(false);
      expect(session.audioBuffer).toEqual([]);
      expect(session.totalAudioReceived).toBe(0);
    });
  });

  describe('startListening', () => {
    it('should start listening to audio', () => {
      // Create a session first
      (voiceService as any).createSession('test-connection');
      
      // Call the method
      voiceService.startListening('test-connection');
      
      // Verify the session was updated
      const session = (voiceService as any).sessions.get('test-connection');
      expect(session.isListening).toBe(true);
      
      // Verify WebRTC message was sent
      expect(webrtcService.sendMessage).toHaveBeenCalledWith(
        'test-connection', 
        { type: 'listening-started' }
      );
    });
    
    it('should not start if WebRTC is not connected', () => {
      // Mock WebRTC as disconnected
      (webrtcService.isConnected as jest.Mock).mockReturnValueOnce(false);
      
      // Create a session first
      (voiceService as any).createSession('test-connection');
      
      // Call the method
      voiceService.startListening('test-connection');
      
      // Verify the session was not updated
      const session = (voiceService as any).sessions.get('test-connection');
      expect(session.isListening).toBe(false);
      
      // Verify error was sent
      expect(webrtcService.sendError).toHaveBeenCalledWith(
        'test-connection',
        'WEBRTC_NOT_CONNECTED',
        expect.any(String)
      );
    });
  });
});