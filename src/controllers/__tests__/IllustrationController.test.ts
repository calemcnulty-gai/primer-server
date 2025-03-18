import { Request, Response } from 'express';
import { IllustrationController } from '../illustrationController';
import { IllustrationService } from '../../services/IllustrationService';
import { StoryStateService } from '../../services/StoryStateService';
import { StoryIllustration } from '../../models/StoryIllustration';
import { StoryState, StorySegment } from '../../models/StoryState';
import { AuthenticatedUser } from '../../models/Auth';

// Mock dependencies
jest.mock('../../services/IllustrationService');
jest.mock('../../services/StoryStateService');

describe('IllustrationController', () => {
  let illustrationController: IllustrationController;
  let mockIllustrationService: jest.Mocked<IllustrationService>;
  let mockStoryStateService: jest.Mocked<StoryStateService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let mockUser: AuthenticatedUser;

  beforeEach(() => {
    // Create mocks
    mockIllustrationService = new IllustrationService() as jest.Mocked<IllustrationService>;
    mockStoryStateService = new StoryStateService(
      null as any, null as any
    ) as jest.Mocked<StoryStateService>;
    
    // Create controller with mocks
    illustrationController = new IllustrationController(
      mockIllustrationService, 
      mockStoryStateService
    );
    
    // Mock request and response
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();
    mockResponse = {
      json: jsonMock,
      status: statusMock
    };
    
    // Create a mock authenticated user
    mockUser = {
      id: 'test-user',
      metadata: {}
    };
    
    // Default request
    mockRequest = {
      user: mockUser,
      header: jest.fn().mockReturnValue('test-device'),
      params: {},
      query: {}
    };
  });

  describe('getCurrentIllustrations', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.header = jest.fn().mockReturnValue(null);

      await illustrationController.getCurrentIllustrations(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized - User ID or Device ID required'
      });
    });

    it('should return 404 if no current segment is found', async () => {
      const mockState = {
        getCurrentSegment: jest.fn().mockReturnValue(null),
        contextualData: {}
      } as unknown as StoryState;

      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState);

      await illustrationController.getCurrentIllustrations(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'No current story segment found'
      });
    });

    it('should return illustrations for the current segment', async () => {
      const mockSegment: StorySegment = {
        id: 'forest-segment',
        content: 'You are in a forest',
        choices: []
      };

      const mockState = {
        getCurrentSegment: jest.fn().mockReturnValue(mockSegment),
        contextualData: { genre: 'fantasy' }
      } as unknown as StoryState;

      const mockIllustrations: StoryIllustration[] = [
        {
          id: 'forest-path',
          path: '/illustrations/forest-path.jpg',
          description: 'A forest path',
          tags: ['forest'],
          segmentMappings: ['forest-segment'],
          themes: ['fantasy'],
          createdAt: new Date()
        }
      ];

      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState);
      mockIllustrationService.getIllustrationsForSegment.mockReturnValue(mockIllustrations);

      await illustrationController.getCurrentIllustrations(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockIllustrationService.getIllustrationsForSegment).toHaveBeenCalledWith(
        'forest-segment',
        { genre: 'fantasy' },
        3
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        segmentId: 'forest-segment',
        illustrations: mockIllustrations
      });
    });
  });

  describe('getSegmentIllustrations', () => {
    it('should return 400 if segment ID is missing', async () => {
      mockRequest.params = {};

      await illustrationController.getSegmentIllustrations(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Segment ID is required'
      });
    });

    it('should return illustrations for the specified segment', async () => {
      mockRequest.params = { segmentId: 'cave-segment' };

      const mockState = {
        contextualData: { genre: 'mystery' }
      } as unknown as StoryState;

      const mockIllustrations: StoryIllustration[] = [
        {
          id: 'mysterious-cave',
          path: '/illustrations/mysterious-cave.jpg',
          description: 'A mysterious cave',
          tags: ['cave'],
          segmentMappings: ['cave-segment'],
          themes: ['mystery'],
          createdAt: new Date()
        }
      ];

      mockStoryStateService.getOrCreateStoryState.mockResolvedValue(mockState);
      mockIllustrationService.getIllustrationsForSegment.mockReturnValue(mockIllustrations);

      await illustrationController.getSegmentIllustrations(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockIllustrationService.getIllustrationsForSegment).toHaveBeenCalledWith(
        'cave-segment',
        { genre: 'mystery' },
        3
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        segmentId: 'cave-segment',
        illustrations: mockIllustrations
      });
    });
  });

  describe('searchIllustrations', () => {
    it('should search illustrations based on query parameters', async () => {
      mockRequest.query = {
        themes: 'fantasy,adventure',
        tags: 'mountain,dragon',
        limit: '2'
      };

      const mockIllustrations: StoryIllustration[] = [
        {
          id: 'dragon-encounter',
          path: '/illustrations/dragon.jpg',
          description: 'A dragon encounter',
          tags: ['dragon', 'mountain'],
          segmentMappings: ['dragon-battle'],
          themes: ['fantasy', 'adventure'],
          createdAt: new Date()
        }
      ];

      mockIllustrationService.getIllustrations.mockReturnValue(mockIllustrations);

      await illustrationController.searchIllustrations(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockIllustrationService.getIllustrations).toHaveBeenCalledWith({
        segmentId: undefined,
        themes: ['fantasy', 'adventure'],
        tags: ['mountain', 'dragon'],
        characters: undefined,
        limit: 2
      });

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        query: {
          segmentId: undefined,
          themes: ['fantasy', 'adventure'],
          tags: ['mountain', 'dragon'],
          characters: undefined,
          limit: 2
        },
        illustrations: mockIllustrations
      });
    });
  });

  describe('getIllustration', () => {
    it('should return 400 if illustration ID is missing', async () => {
      mockRequest.params = {};

      await illustrationController.getIllustration(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Illustration ID is required'
      });
    });

    it('should return 404 if illustration is not found', async () => {
      mockRequest.params = { id: 'non-existent-id' };

      mockIllustrationService.getIllustrationById.mockReturnValue(null);

      await illustrationController.getIllustration(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Illustration not found with ID: non-existent-id'
      });
    });

    it('should return the illustration if found', async () => {
      mockRequest.params = { id: 'hero-character' };

      const mockIllustration: StoryIllustration = {
        id: 'hero-character',
        path: '/illustrations/hero.jpg',
        description: 'The hero',
        tags: ['hero'],
        segmentMappings: ['intro'],
        themes: ['adventure'],
        createdAt: new Date()
      };

      mockIllustrationService.getIllustrationById.mockReturnValue(mockIllustration);

      await illustrationController.getIllustration(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockIllustrationService.getIllustrationById).toHaveBeenCalledWith('hero-character');
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        illustration: mockIllustration
      });
    });
  });
});