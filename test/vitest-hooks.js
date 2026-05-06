import { beforeEach, afterEach } from 'vitest';
import { reset } from './setup.js';

beforeEach(async () => {
  await reset();
});

afterEach(async () => {
  await reset();
});
