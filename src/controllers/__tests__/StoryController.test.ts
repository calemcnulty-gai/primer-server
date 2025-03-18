import { Request, Response } from 'express';
import { StoryController } from '../storyController';
import { StoryStateService } from '../../services/StoryStateService';
import { GPTClient } from '../../services/GPTClient';
import { StorySegment, StoryState } from '../../models/StoryState';
import { InMemoryStateStorage } from '../../services/persistence/InMemoryStateStorage';
import { AuthenticatedUser } from '../../models/Auth';
import { PersonalizationManager } from '../../services/PersonalizationManager';

jest.mock('../../services/StoryStateService');
jest.mock('../../services/GPTClient');
jest.mock('../../services/PersonalizationManager');

describe('StoryController', () => {
  let storyController: StoryController;
  let mockStoryStateService: jest.Mocked<StoryStateService>;
  let mockPersonalizationManager: jest.Mocked<PersonalizationManager>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let mockUser: AuthenticatedUser;

  beforeEach(() => {
    mockStoryStateService = new StoryStateService(
      new GPTClient('test-key'),
      new InMemoryStateStorage()
    ) as jest.Mocked<StoryStateService>;

    mockPersonalizationManager = new PersonalizationManager() as jest.Mocked<PersonalizationManager>;

    storyController = new StoryController(mockStoryStateService, mockPersonalizationManager);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();
    mockRes = {
      json: jsonMock,
      status: statusMock
    };

    // Create a mock authenticated user
    mockUser = {
      id: 'test-user',
      metadata: {}
    };

    // Default request
    mockReq = {
      user: mockUser,
      header: jest.fn().mockReturnValue('test-device'),
      body: {}
    };
  });

  describe('getCurrentStory', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.header = jest.fn().mockReturnValue(null);

      await storyController.getCurrentStory(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Unauthorized - User ID or Device ID required' 
      });
    });

    it('should return initial story segment for new user', async () => {
      const mockSegment: StorySegment = {
        id: 'intro',
        content: 'Test story content',
        choices: []
      };

      const mockState = {
        getCurrentSegment: jest.fn().mockReturnValue(null),
        getPublicState: jest.fn().mockReturnValue({ progress: 0 }),
        updateContextualData: jest.fn(),
        markSegmentAsRead: jest.fn()
      };

      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState as any);
      mockStoryStateService.generateInitialStorySegment.mockResolvedValue(mockSegment);
      mockStoryStateService.saveStoryState.mockResolvedValue();

      await storyController.getCurrentStory(mockReq as Request, mockRes as Response);

      expect(mockState.markSegmentAsRead).toHaveBeenCalledWith('intro');
      expect(mockStoryStateService.saveStoryState).toHaveBeenCalledWith('test-user');
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        segment: {
          id: 'intro',
          content: 'Test story content',
          choices: []
        },
        state: { progress: 0 }
      });
    });

    it('should return existing story segment for returning user', async () => {
      const mockSegment: StorySegment = {
        id: 'current',
        content: 'Current story content',
        choices: []
      };

      const mockState = {
        getCurrentSegment: jest.fn().mockReturnValue(mockSegment),
        getPublicState: jest.fn().mockReturnValue({ progress: 50 }),
        updateContextualData: jest.fn(),
        markSegmentAsRead: jest.fn()
      };

      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState as any);
      mockStoryStateService.saveStoryState.mockResolvedValue();

      await storyController.getCurrentStory(mockReq as Request, mockRes as Response);

      expect(mockState.markSegmentAsRead).toHaveBeenCalledWith('current');
      expect(mockStoryStateService.saveStoryState).toHaveBeenCalledWith('test-user');
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        segment: {
          id: 'current',
          content: 'Current story content',
          choices: []
        },
        state: { progress: 50 }
      });
    });
  });

  describe('makeChoice', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.header = jest.fn().mockReturnValue(null);
      mockReq.body = { choiceId: 'choice1' };

      await storyController.makeChoice(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ 
        success: false,
        error: 'Unauthorized - User ID or Device ID required' 
      });
    });

    it('should return 400 if choice ID is missing', async () => {
      mockReq.body = {};

      await storyController.makeChoice(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ 
        success: false,
        error: 'Choice ID is required' 
      });
    });

    it('should generate next segment based on choice', async () => {
      const mockNextSegment: StorySegment = {
        id: 'next',
        content: 'Next story content',
        choices: []
      };

      const mockState = {
        getPublicState: jest.fn().mockReturnValue({ progress: 75 }),
        updateContextualData: jest.fn(),
        markSegmentAsRead: jest.fn(),
        getCurrentSegment: jest.fn().mockReturnValue(mockNextSegment)
      };

      mockStoryStateService.generateNextSegment.mockResolvedValue(mockNextSegment);
      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState as any);
      mockStoryStateService.saveStoryState.mockResolvedValue();

      mockReq.body = { choiceId: 'choice1' };

      await storyController.makeChoice(mockReq as Request, mockRes as Response);

      expect(mockStoryStateService.generateNextSegment).toHaveBeenCalledWith('test-user', 'choice1');
      expect(mockState.markSegmentAsRead).toHaveBeenCalledWith('next');
      expect(mockStoryStateService.saveStoryState).toHaveBeenCalledWith('test-user');
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        segment: {
          id: 'next',
          content: 'Next story content',
          choices: []
        },
        state: { progress: 75 }
      });
    });
  });

  describe('updateProgress', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.header = jest.fn().mockReturnValue(null);
      mockReq.body = { segmentId: 'segment1' };

      await storyController.updateProgress(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ 
        success: false,
        error: 'Unauthorized - User ID or Device ID required' 
      });
    });

    it('should return 400 if segment ID is missing', async () => {
      mockReq.body = {};

      await storyController.updateProgress(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ 
        success: false,
        error: 'Segment ID is required' 
      });
    });

    it('should update progress and preferences', async () => {
      const mockState = {
        markSegmentAsRead: jest.fn(),
        updateContextualData: jest.fn(),
        getPublicState: jest.fn().mockReturnValue({ progress: 100 }),
        getCurrentSegment: jest.fn()
      };

      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState as any);
      mockStoryStateService.saveStoryState.mockResolvedValue();
      mockPersonalizationManager.updateUserPreferences.mockResolvedValue();

      mockReq.body = {
        segmentId: 'segment1',
        preferences: { tone: 'mysterious' }
      };

      await storyController.updateProgress(mockReq as Request, mockRes as Response);

      expect(mockState.markSegmentAsRead).toHaveBeenCalledWith('segment1');
      expect(mockState.updateContextualData).toHaveBeenCalledWith({ tone: 'mysterious' });
      expect(mockPersonalizationManager.updateUserPreferences).toHaveBeenCalledWith('test-user', { tone: 'mysterious' });
      expect(mockStoryStateService.saveStoryState).toHaveBeenCalledWith('test-user');
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        state: { progress: 100 }
      });
    });
  });

  describe('resetStory', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.header = jest.fn().mockReturnValue(null);

      await storyController.resetStory(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized - User ID or Device ID required'
      });
    });

    it('should reset user story and return initial segment', async () => {
      const mockSegment: StorySegment = {
        id: 'intro',
        content: 'Fresh start',
        choices: [{ id: 'choice1', text: 'Begin', nextSegmentId: 'next' }]
      };

      const mockState = {
        getCurrentSegment: jest.fn().mockReturnValue(mockSegment),
        getPublicState: jest.fn().mockReturnValue({ progress: 0 })
      };

      mockStoryStateService.clearUserState.mockResolvedValue();
      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState as any);

      await storyController.resetStory(mockReq as Request, mockRes as Response);

      expect(mockStoryStateService.clearUserState).toHaveBeenCalledWith('test-user');
      expect(mockStoryStateService.getOrCreateStoryState).toHaveBeenCalledWith('test-user');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Story reset successfully',
        segment: {
          id: 'intro',
          content: 'Fresh start',
          choices: [{ id: 'choice1', text: 'Begin' }]
        },
        state: { progress: 0 }
      });
    });
  });
}); 