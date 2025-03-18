import { Router } from 'express';
import { storyMonitoring } from '../utils/storyMonitoring';

/**
 * Initialize monitoring routes
 */
export function initMonitoringRoutes(): Router {
  const router = Router();
  
  // GET dashboard data
  router.get('/dashboard', (req, res) => {
    const data = storyMonitoring.getDashboardData();
    res.json({
      success: true,
      timestamp: new Date(),
      data
    });
  });
  
  // GET recent GPT metrics
  router.get('/gpt', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const metrics = storyMonitoring.getRecentGPTMetrics(limit);
    res.json({
      success: true,
      count: metrics.length,
      metrics
    });
  });
  
  // GET recent story generation metrics
  router.get('/story', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const metrics = storyMonitoring.getRecentStoryGenerationMetrics(limit);
    res.json({
      success: true,
      count: metrics.length,
      metrics
    });
  });
  
  // GET metrics for a specific user
  router.get('/user/:userId', (req, res) => {
    const { userId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    
    const gptMetrics = storyMonitoring.getGPTMetricsByUser(userId, limit);
    const storyMetrics = storyMonitoring.getStoryGenerationMetricsByUser(userId, limit);
    
    res.json({
      success: true,
      userId,
      gptMetrics: {
        count: gptMetrics.length,
        metrics: gptMetrics
      },
      storyMetrics: {
        count: storyMetrics.length,
        metrics: storyMetrics
      }
    });
  });
  
  return router;
}