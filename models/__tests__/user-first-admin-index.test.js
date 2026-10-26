import { describe, it, expect } from 'vitest';
import { User } from '../user.js';

// api/auth/auth-signup.js relies on this index to allow only one first admin.
describe('User.isFirstAdmin', () => {
  it('has a unique sparse index', () => {
    const index = User.schema.indexes().find(([fields]) => 'isFirstAdmin' in fields);
    expect(index).toBeDefined();
    expect(index[1]).toMatchObject({ unique: true, sparse: true });
  });

  it('has no default, so later users never store a value that would collide', () => {
    expect(new User({ email: 'a@canada.ca', password: 'password123' }).isFirstAdmin).toBeUndefined();
  });
});
