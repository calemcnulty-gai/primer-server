import { Request, Response } from 'express';
import { IllustrationService } from '../services/IllustrationService';
import { StoryStateService } from '../services/StoryStateService';
import { AuthenticatedUser } from '../models/Auth';

export class IllustrationController {
  private illustrationService: IllustrationService;
  private storyStateService: StoryStateService;
  
  constructor(
    illustrationService: IllustrationService,
    storyStateService: StoryStateService
  ) {
    this.illustrationService = illustrationService;
    this.storyStateService = storyStateService;
  }
  
  /**
   * Get illustrations for the current story segment
   * @route GET /api/story/illustrations/current
   */
  async getCurrentIllustrations(req: Request, res: Response): Promise<void> {
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = (req.user as AuthenticatedUser)?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required'
        });
        return;
      }

      // Get the user's story state
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);
      const currentSegment = storyState.getCurrentSegment();

      if (!currentSegment) {
        res.status(404).json({
          success: false,
          error: 'No current story segment found'
        });
        return;
      }

      // Get illustrations for the current segment
      const illustrations = this.illustrationService.getIllustrationsForSegment(
        currentSegment.id,
        {
          ...storyState.contextualData,
          userId: storyState.userId
        },
        3 // Limit to 3 illustrations
      );

      res.json({
        success: true,
        segmentId: currentSegment.id,
        illustrations
      });
    } catch (error) {
      console.error('Error getting illustrations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get illustrations',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get illustrations for a specific segment
   * @route GET /api/story/illustrations/segment/:segmentId
   */
  async getSegmentIllustrations(req: Request, res: Response): Promise<void> {
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = (req.user as AuthenticatedUser)?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required'
        });
        return;
      }

      const { segmentId } = req.params;
      if (!segmentId) {
        res.status(400).json({
          success: false,
          error: 'Segment ID is required'
        });
        return;
      }

      // Get the user's story state for context
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);

      // Get illustrations for the specified segment
      const illustrations = this.illustrationService.getIllustrationsForSegment(
        segmentId,
        {
          ...storyState.contextualData,
          userId: storyState.userId
        },
        3 // Limit to 3 illustrations
      );

      res.json({
        success: true,
        segmentId,
        illustrations
      });
    } catch (error) {
      console.error('Error getting segment illustrations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get segment illustrations',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get illustrations by custom criteria
   * @route GET /api/story/illustrations/search
   */
  async searchIllustrations(req: Request, res: Response): Promise<void> {
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = (req.user as AuthenticatedUser)?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required'
        });
        return;
      }

      const { segmentId, themes, tags, characters, limit } = req.query;

      // Parse query parameters
      const request = {
        segmentId: segmentId as string,
        themes: themes ? (themes as string).split(',') : undefined,
        tags: tags ? (tags as string).split(',') : undefined,
        characters: characters ? (characters as string).split(',') : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined
      };

      // Get illustrations matching the criteria
      const illustrations = this.illustrationService.getIllustrations(request);

      res.json({
        success: true,
        query: request,
        illustrations
      });
    } catch (error) {
      console.error('Error searching illustrations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search illustrations',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get a specific illustration by ID
   * @route GET /api/story/illustrations/:id
   */
  async getIllustration(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Illustration ID is required'
        });
        return;
      }

      // Get the illustration by ID
      const illustration = this.illustrationService.getIllustrationById(id);

      if (!illustration) {
        res.status(404).json({
          success: false,
          error: `Illustration not found with ID: ${id}`
        });
        return;
      }

      res.json({
        success: true,
        illustration
      });
    } catch (error) {
      console.error('Error getting illustration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get illustration',
        message: (error as Error).message
      });
    }
  }
}