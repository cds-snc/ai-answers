import { describe, it, expect, vi, beforeEach } from 'vitest';
import signupHandler from '../api/auth/auth-signup.js';
import { User } from '../models/user.js';

// Mock dependencies
vi.mock('../models/user.js', () => {
    const UserMock = vi.fn();
    UserMock.findOne = vi.fn();
    UserMock.exists = vi.fn();
    return { User: UserMock };
});

vi.mock('../api/db/db-connect.js', () => ({
    default: vi.fn().mockResolvedValue(true)
}));

const makeRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
});

const makeReq = (body) => ({ body, login: vi.fn((user, cb) => cb(null)) });

const duplicateKeyError = () => Object.assign(new Error('E11000 duplicate key'), { code: 11000 });

// `saveFor(data)` decides what each constructed user's save() does.
// A `function`, not an arrow: the handler calls `new User(...)`, and
// Vitest 4 can't construct an arrow-function mock.
const mockNewUser = (saveFor = () => Promise.resolve(true)) => {
    User.mockImplementation(function (data) {
        return { ...data, _id: 'new-id', save: vi.fn(() => saveFor(data)) };
    });
};

describe('Auth Signup Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        User.findOne.mockResolvedValue(null);
        // Not the first user unless a test says so
        User.exists.mockResolvedValue({ _id: 'older-id' });
        mockNewUser();
    });

    it('should normalize email (lowercase) before checking existence', async () => {
        const res = makeRes();
        await signupHandler(makeReq({ email: 'TestUser@Example.Com', password: 'password123' }), res);

        // Verify findOne was called with normalized email
        expect(User.findOne).toHaveBeenCalledWith({
            email: 'testuser@example.com'
        });

        // Verify User was instantiated with normalized email
        expect(User).toHaveBeenCalledWith(expect.objectContaining({
            email: 'testuser@example.com'
        }));

        // The legacy 2FA secret is no longer generated or stored
        expect(User.mock.calls[0][0]).not.toHaveProperty('twoFASecret');

        // Verify success response
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should normalize email (trim) before checking existence', async () => {
        await signupHandler(makeReq({ email: '  testuser@example.com  ', password: 'password123' }), makeRes());

        expect(User.findOne).toHaveBeenCalledWith({
            email: 'testuser@example.com'
        });
    });

    it('should reject if email is missing', async () => {
        const res = makeRes();
        await signupHandler({ body: { password: 'password123' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('required')
        }));
    });

    it.each([
        ['no @', 'account'],
        ['no domain dot', 'account@account'],
        ['spaces', 'a b@example.com'],
        ['too long', `${'a'.repeat(250)}@example.com`],
        ['not a string', ['a@example.com']],
    ])('rejects an invalid email (%s) without touching the database', async (_label, email) => {
        const res = makeRes();
        await signupHandler(makeReq({ email, password: 'password123' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(User.findOne).not.toHaveBeenCalled();
        expect(User).not.toHaveBeenCalled();
    });

    it.each([
        ['too short', 'short'],
        ['not a string', 12345678],
    ])('rejects a password that breaks the rule (%s) without touching the database', async (_label, password) => {
        const res = makeRes();
        await signupHandler(makeReq({ email: 'a@example.com', password }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(User.findOne).not.toHaveBeenCalled();
        expect(User).not.toHaveBeenCalled();
    });

    it('should reject if existing user found (normalized check)', async () => {
        const res = makeRes();
        User.findOne.mockResolvedValue({ _id: 'existing-id', email: 'exists@example.com' });

        await signupHandler(makeReq({ email: 'Exists@Example.Com', password: 'password123' }), res);

        expect(User.findOne).toHaveBeenCalledWith({ email: 'exists@example.com' });
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'User already exists'
        }));
    });

    it('creates a later user as an inactive partner and does not log them in', async () => {
        const req = makeReq({ email: 'new@example.com', password: 'password123' });
        const res = makeRes();
        await signupHandler(req, res);

        expect(User).toHaveBeenCalledTimes(1);
        expect(User.mock.calls[0][0]).toMatchObject({ role: 'partner', active: false });
        expect(User.mock.calls[0][0]).not.toHaveProperty('isFirstAdmin');
        // Logging in would put passport.user on the session and move the
        // caller to the signed-in rate-limit bucket.
        expect(req.login).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            user: expect.objectContaining({ role: 'partner', active: false })
        }));
    });

    it('creates the first user as an active admin in one write and logs them in', async () => {
        User.exists.mockResolvedValue(null);
        const req = makeReq({ email: 'first@example.com', password: 'password123' });
        const res = makeRes();
        await signupHandler(req, res);

        expect(User).toHaveBeenCalledTimes(1);
        expect(User.mock.calls[0][0]).toMatchObject({ role: 'admin', active: true, isFirstAdmin: true });
        expect(req.login).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            user: expect.objectContaining({ role: 'admin', active: true })
        }));
    });

    it('saves the loser of a first-admin race as an inactive partner', async () => {
        // Both sign-ups found the database empty; the other one claimed isFirstAdmin.
        User.exists.mockResolvedValue(null);
        mockNewUser((data) => (data.isFirstAdmin ? Promise.reject(duplicateKeyError()) : Promise.resolve(true)));
        const req = makeReq({ email: 'second@example.com', password: 'password123' });
        const res = makeRes();
        await signupHandler(req, res);

        expect(User).toHaveBeenCalledTimes(2);
        expect(User.mock.calls[1][0]).toMatchObject({ role: 'partner', active: false });
        expect(User.mock.calls[1][0]).not.toHaveProperty('isFirstAdmin');
        expect(req.login).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('answers "already exists" when a double submit collides on the email index', async () => {
        mockNewUser(() => Promise.reject(duplicateKeyError()));
        const res = makeRes();
        await signupHandler(makeReq({ email: 'new@example.com', password: 'password123' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User already exists' }));
    });

    it('answers "already exists" when an empty-database sign-up collides on the email both times', async () => {
        User.exists.mockResolvedValue(null);
        mockNewUser(() => Promise.reject(duplicateKeyError()));
        const res = makeRes();
        await signupHandler(makeReq({ email: 'new@example.com', password: 'password123' }), res);

        expect(User).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User already exists' }));
    });

    it('returns 500 for a save error that is not a duplicate key', async () => {
        mockNewUser(() => Promise.reject(new Error('connection lost')));
        const res = makeRes();
        await signupHandler(makeReq({ email: 'new@example.com', password: 'password123' }), res);

        expect(User).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
