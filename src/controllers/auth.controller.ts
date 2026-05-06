import { Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/token.service';
import { sendWelcomeEmail } from '../services/email.service';
import { AuthRequest } from '../middleware/auth';

// ── Schemas ────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Helpers ────────────────────────────────────────────────────────────────
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ── Controllers ────────────────────────────────────────────────────────────
export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, email, password } = req.body as z.infer<typeof registerSchema>;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already in use', 409, 'CONFLICT');

  const user = await User.create({ name, email, password });
  await sendWelcomeEmail(email, name);

  const accessToken = signAccessToken(String(user._id), user.role);
  const refreshToken = signRefreshToken(String(user._id), user.role);

  await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: refreshToken } });

  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTS);
  res.status(201).json({ success: true, accessToken, user });
});

export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  const accessToken = signAccessToken(String(user._id), user.role);
  const refreshToken = signRefreshToken(String(user._id), user.role);

  // Rotate: keep last 5 refresh tokens (multi-device support)
  const tokens = [...user.refreshTokens.slice(-4), refreshToken];
  await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: tokens } });

  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTS);

  const { password: _pw, refreshTokens: _rt, ...safeUser } = user.toObject();
  res.json({ success: true, accessToken, user: safeUser });
});

export const refresh = asyncHandler(async (req: AuthRequest, res: Response) => {
  const token: string | undefined = req.cookies?.refreshToken;
  if (!token) throw new AppError('No refresh token', 401, 'UNAUTHORIZED');

  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'UNAUTHORIZED');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !user.refreshTokens.includes(token)) {
    throw new AppError('Refresh token reuse detected', 401, 'UNAUTHORIZED');
  }

  const newAccess = signAccessToken(String(user._id), user.role);
  const newRefresh = signRefreshToken(String(user._id), user.role);

  const tokens = user.refreshTokens.filter((t) => t !== token).concat(newRefresh);
  await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: tokens } });

  res.cookie('refreshToken', newRefresh, REFRESH_COOKIE_OPTS);
  res.json({ success: true, accessToken: newAccess });
});

export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const token: string | undefined = req.cookies?.refreshToken;
  if (token) {
    await User.findByIdAndUpdate(req.userId, { $pull: { refreshTokens: token } });
  }
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out' });
});

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  res.json({ success: true, user });
});
