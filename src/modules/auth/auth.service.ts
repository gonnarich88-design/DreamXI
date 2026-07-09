import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/client';

const BCRYPT_ROUNDS = 12;

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export async function registerUser(
  email: string,
  password: string,
): Promise<{ id: string; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new EmailAlreadyExistsError(email);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { id: user.id, email: user.email };
}

export async function loginUser(email: string, password: string): Promise<{ token: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new InvalidCredentialsError();

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new InvalidCredentialsError();

  const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });
  return { token };
}

export function verifyToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
  return { userId: decoded.userId };
}
