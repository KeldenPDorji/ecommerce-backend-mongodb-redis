import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { User } from '../models/User';
import { redisService } from '../services/redis.service';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  sessionId?: string;
}

interface JwtPayload {
  sub: string;
  role: string;
  sid: string;
  type: 'access' | 'refresh';
}

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    if (payload.type !== 'access') {
      return next(new AppError('Invalid token type', 401, 'UNAUTHORIZED'));
    }
    const session = await redisService.getSession(payload.sid);
    if (!session || session.userId !== payload.sub) {
      return next(new AppError('Session expired or revoked', 401, 'UNAUTHORIZED'));
    }

    req.userId = payload.sub;
    req.userRole = payload.role;
    req.sessionId = payload.sid;
    await redisService.touchSession(payload.sid);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
    }
    next();
  };
}

export async function loadUser(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.userId);
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    next();
  } catch (err) {
    next(err);
  }
}
