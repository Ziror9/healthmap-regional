import type { Request, Response } from 'express';
import { getLiveness, getReadiness } from '../services/health.service.js';

export function healthController(_req: Request, res: Response): void {
  res.status(200).json(getLiveness());
}

export async function readinessController(_req: Request, res: Response): Promise<void> {
  const result = await getReadiness();
  res.status(result.status === 'ok' ? 200 : 503).json(result);
}
