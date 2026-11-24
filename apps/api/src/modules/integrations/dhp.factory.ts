import type { Env } from '../../config/env.js';
import { HttpDhpClient, MockDhpClient, type DhpClient } from './dhp.client.js';

export function buildDhpClient(env: Pick<Env, 'DHP_MODE' | 'DHP_BASE_URL'>): DhpClient {
  if (env.DHP_MODE === 'http') {
    if (!env.DHP_BASE_URL) throw new Error('DHP_BASE_URL is required when DHP_MODE=http');
    return new HttpDhpClient(env.DHP_BASE_URL);
  }
  return new MockDhpClient();
}
