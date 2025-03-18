import { Router, Request, Response } from 'express';

const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.formatter.success({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString()
    }
  });
});

export { healthRouter }; 