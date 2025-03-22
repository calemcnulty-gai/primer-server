import { EventEmitter } from 'events';
import { VoiceService } from '../VoiceService';
import { MediasoupService } from '../MediasoupService';
import { jest } from '@jest/globals';

describe('VoiceService', () => {
  let voiceService: VoiceService;
  let mediasoupService: jest.Mocked<MediasoupService>;

  beforeEach(() => {
    // Create a mock MediasoupService
    mediasoupService = {
      on: jest.fn(),
      isConnected: jest.fn(),
      sendNotificationById: jest.fn(),
      handleConnection: jest.fn(),
      ...new EventEmitter()
    } as unknown as jest.Mocked<MediasoupService>;

    voiceService = new VoiceService(mediasoupService);
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
    it('should return false if no session exists', () => {
      const result = voiceService.startListening('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false if mediasoup is not connected', () => {
      // Create a session first
      voiceService['createSession']('test');
      mediasoupService.isConnected.mockReturnValue(false);

      const result = voiceService.startListening('test');
      expect(result).toBe(false);
      expect(mediasoupService.isConnected).toHaveBeenCalledWith('test');
    });

    it('should start listening if session exists and mediasoup is connected', () => {
      // Create a session first
      voiceService['createSession']('test');
      mediasoupService.isConnected.mockReturnValue(true);

      const result = voiceService.startListening('test');
      expect(result).toBe(true);
    });
  });

  describe('stopListening', () => {
    it('should do nothing if no session exists', () => {
      voiceService.stopListening('nonexistent');
      expect(mediasoupService.sendNotificationById).not.toHaveBeenCalled();
    });

    it('should stop listening and send notification', () => {
      // Create and start a session first
      voiceService['createSession']('test');
      mediasoupService.isConnected.mockReturnValue(true);
      voiceService.startListening('test');

      voiceService.stopListening('test');
      expect(mediasoupService.sendNotificationById).toHaveBeenCalledWith('test', 'listening-stopped');
    });
  });
});