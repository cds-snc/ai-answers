import { describe, it, expect } from 'vitest';
import { User } from '../models/user.js';

describe('User Model Schema', () => {
    it('should validate with role "partner"', () => {
        const user = new User({
            email: 'partner@example.com',
            password: 'password123',
            role: 'partner'
        });
        const error = user.validateSync();
        expect(error).toBeUndefined();
    });

    it('should validate with role "admin"', () => {
        const user = new User({
            email: 'admin@example.com',
            password: 'password123',
            role: 'admin'
        });
        const error = user.validateSync();
        expect(error).toBeUndefined();
    });

    it('should default role to "partner"', () => {
        const user = new User({
            email: 'default@example.com',
            password: 'password123'
        });
        expect(user.role).toBe('partner');
    });

    it('should fail validation with role "user"', () => {
        const user = new User({
            email: 'user@example.com',
            password: 'password123',
            role: 'user'
        });
        const error = user.validateSync();
        expect(error.errors.role).toBeDefined();
        expect(error.errors.role.message).toContain('is not a valid enum value');
    });
});
