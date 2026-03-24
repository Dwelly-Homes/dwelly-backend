import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { sendError } from '../utils/response';

export const validate = (chains: ValidationChain[]) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await Promise.all(chains.map((chain) => chain.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendError(res, 'Validation failed', 422, errors.array());
      return;
    }
    next();
  };
