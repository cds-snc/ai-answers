import { describe, it, expect, vi, beforeEach } from 'vitest';
import signupHandler from '../api/auth/auth-signup.js';
import { User } from '../models/user.js';

// Mock dependencies
vi.mock('../models/user.js', () => {
    const UserMock = vi.fn();
    UserMock.findOne = vi.fn();
    UserMock.countDocuments = vi.fn();
    return { User: UserMock };
});

vi.mock('../api/db/db-connect.js', () => ({
    default: vi.fn().mockResolvedValue(true)
}));

// Mock speakeasy
vi.mock('speakeasy', () => ({
    default: {
        generateSecret: () => ({ base32: 'secret' })
    }
}));

describe('Auth Signup Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should normalize email (lowercase) before checking existence', async () => {
        const req = {
            body: {
                email: 'TestUser@Example.Com',
                password: 'password123'
            },
            login: vi.fn((user, cb) => cb(null))
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        // Mock User.findOne to return null (no user found)
        User.findOne.mockResolvedValue(null);
        User.countDocuments.mockResolvedValue(0);

        // Mock User constructor
        User.mockImplementation((data) => ({
            ...data,
            save: vi.fn().mockResolvedValue(true),
            _id: 'mock-id'
        }));

        await signupHandler(req, res);

        // Verify findOne was called with normalized email
        expect(User.findOne).toHaveBeenCalledWith({
            email: 'testuser@example.com'
        });

        // Verify User was instantiated with normalized email
        expect(User).toHaveBeenCalledWith(expect.objectContaining({
            email: 'testuser@example.com'
        }));

        // Verify success response
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should normalize email (trim) before checking existence', async () => {
        const req = {
            body: {
                email: '  testuser@example.com  ',
                password: 'password123'
            },
            login: vi.fn((user, cb) => cb(null))
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        User.findOne.mockResolvedValue(null);
        User.countDocuments.mockResolvedValue(0);
        User.mockImplementation((data) => ({
            ...data,
            save: vi.fn().mockResolvedValue(true),
            _id: 'mock-id'
        }));

        await signupHandler(req, res);

        expect(User.findOne).toHaveBeenCalledWith({
            email: 'testuser@example.com'
        });
    });

    it('should reject if email is missing', async () => {
        const req = { body: { password: 'pass' } }; // No email
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        await signupHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('required')
        }));
    });

    it('should reject if existing user found (normalized check)', async () => {
        const req = {
            body: {
                email: 'Exists@Example.Com',
                password: 'password123'
            }
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        // Mock finding a user
        User.findOne.mockResolvedValue({ _id: 'existing-id', email: 'exists@example.com' });

        await signupHandler(req, res);

        expect(User.findOne).toHaveBeenCalledWith({ email: 'exists@example.com' });
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'User already exists'
        }));
    });
});
