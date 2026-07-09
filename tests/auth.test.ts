import request from 'supertest';
import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { createApp } from '../src/app';

const app = createApp();

describe('auth routes', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registers a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'hunter2pass' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@example.com' });
    expect(res.body.id).toBeDefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('rejects registering the same email twice', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'hunter2pass' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'anotherpass' });

    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials and returns a JWT', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'login@example.com', password: 'hunter2pass' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'hunter2pass' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects login with wrong password', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'wrongpw@example.com', password: 'hunter2pass' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrongpw@example.com', password: 'nope' });

    expect(res.status).toBe(401);
  });

  it('returns 500 instead of hanging when an unexpected error occurs during registration', async () => {
    // Without asyncHandler wrapping the route, Express 4 does not forward a
    // rejected promise from an async handler to the error middleware -- the
    // request would hang with no response instead of reaching this assertion.
    const createSpy = jest
      .spyOn(prisma.user, 'create')
      .mockRejectedValueOnce(new Error('simulated db failure'));

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'unexpected-error@example.com', password: 'hunter2pass' });

    expect(res.status).toBe(500);

    createSpy.mockRestore();
  });
});
