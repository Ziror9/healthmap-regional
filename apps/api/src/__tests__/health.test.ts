import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseUrl, readJson, startTestServer, stopTestServer } from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface HealthBody {
  status: string;
  service: string;
}

interface ReadinessBody extends HealthBody {
  dependencies: { database: { status: string } };
}

describe('GET /health', () => {
  it('continua respondendo 200 com status ok (liveness)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await readJson<HealthBody>(res);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('healthmap-api');
  });
});

describe('GET /health/ready', () => {
  it('continua respondendo 200 com database ok (readiness)', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(200);
    const body = await readJson<ReadinessBody>(res);
    expect(body.status).toBe('ok');
    expect(body.dependencies.database.status).toBe('ok');
  });
});
