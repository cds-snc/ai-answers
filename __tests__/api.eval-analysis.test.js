import { beforeEach, describe, expect, it, vi } from 'vitest';

const countEvalsMock = vi.fn();
const createAnalysisMock = vi.fn();
const advanceMock = vi.fn();
const getAnalysisMock = vi.fn();
const listAnalysesMock = vi.fn();

vi.mock('../services/EvalAnalysisService.js', () => ({
    __esModule: true,
    default: {
        countEvals: (...args) => countEvalsMock(...args),
        createAnalysis: (...args) => createAnalysisMock(...args),
        advance: (...args) => advanceMock(...args),
        getAnalysis: (...args) => getAnalysisMock(...args),
        listAnalyses: (...args) => listAnalysesMock(...args)
    },
    MIN_EVALS: 20,
    MAX_EVALS: 200
}));

import precheckHandler from '../api/eval/eval-analysis-precheck.js';
import runHandler from '../api/eval/eval-analysis-run.js';
import advanceHandler from '../api/eval/eval-analysis-advance.js';
import getHandler from '../api/eval/eval-analysis-get.js';
import listHandler from '../api/eval/eval-analysis-list.js';
import { pickFilters } from '../api/eval/eval-analysis-util.js';

const makeRes = () => {
    const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res)
    };
    return res;
};

const authedReq = (overrides = {}) => ({
    isAuthenticated: vi.fn(() => true),
    user: { role: 'partner', userId: 'u1', email: 'lead@dept.gc.ca' },
    path: '/api/eval/eval-analysis',
    query: {},
    body: {},
    ...overrides
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('pickFilters', () => {
    it('whitelists known filter keys and drops empties and unknowns', () => {
        expect(pickFilters({
            department: 'TBS-SCT',
            startDate: '2026-06-01T00:00:00Z',
            userType: '',
            bogus: 'x',
            aiEval: 'hasError'
        })).toEqual({
            department: 'TBS-SCT',
            startDate: '2026-06-01T00:00:00Z',
            aiEval: 'hasError'
        });
    });
});

describe('eval-analysis-precheck', () => {
    it('requires a department', async () => {
        const res = makeRes();
        await precheckHandler(authedReq({ method: 'GET', query: {} }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'departmentRequired' }));
        expect(countEvalsMock).not.toHaveBeenCalled();
    });

    it('returns count with min/max gates', async () => {
        countEvalsMock.mockResolvedValue(42);
        const res = makeRes();
        await precheckHandler(authedReq({ method: 'GET', query: { department: 'TBS-SCT' } }), res);
        expect(countEvalsMock).toHaveBeenCalledWith({ department: 'TBS-SCT' });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ count: 42, min: 20, max: 200 });
    });

    it('rejects non-GET', async () => {
        const res = makeRes();
        await precheckHandler(authedReq({ method: 'POST' }), res);
        expect(res.status).toHaveBeenCalledWith(405);
    });
});

describe('eval-analysis-run', () => {
    it('creates an analysis and passes the requesting user email', async () => {
        createAnalysisMock.mockResolvedValue({ _id: 'a1', status: 'running' });
        const res = makeRes();
        await runHandler(authedReq({
            method: 'POST',
            body: { filters: { department: 'TBS-SCT' }, language: 'fr' }
        }), res);
        expect(createAnalysisMock).toHaveBeenCalledWith({
            filters: { department: 'TBS-SCT' },
            language: 'fr',
            requestedBy: 'lead@dept.gc.ca'
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ analysis: { _id: 'a1', status: 'running' } });
    });

    it('maps volume-gate errors to 400 with the code and count', async () => {
        const err = new Error('Too few evaluations to analyze (5 < 20)');
        err.code = 'tooFew';
        err.count = 5;
        createAnalysisMock.mockRejectedValue(err);
        const res = makeRes();
        await runHandler(authedReq({ method: 'POST', body: { filters: { department: 'TBS-SCT' } } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'tooFew', count: 5 }));
    });

    it('returns 500 for unexpected errors', async () => {
        createAnalysisMock.mockRejectedValue(new Error('boom'));
        const res = makeRes();
        await runHandler(authedReq({ method: 'POST', body: { filters: { department: 'TBS-SCT' } } }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('eval-analysis-advance', () => {
    it('advances by id and returns the analysis', async () => {
        advanceMock.mockResolvedValue({ _id: 'a1', status: 'classifying', progress: { classified: 20, total: 60 } });
        const res = makeRes();
        await advanceHandler(authedReq({ method: 'POST', body: { analysisId: 'deadbeefdeadbeefdeadbeef' } }), res);
        expect(advanceMock).toHaveBeenCalledWith('deadbeefdeadbeefdeadbeef');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects a non-ObjectId analysisId', async () => {
        const res = makeRes();
        await advanceHandler(authedReq({ method: 'POST', body: { analysisId: { $ne: 'x' } } }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(advanceMock).not.toHaveBeenCalled();
    });

    it('maps notFound to 404', async () => {
        const err = new Error('Analysis not found');
        err.code = 'notFound';
        advanceMock.mockRejectedValue(err);
        const res = makeRes();
        await advanceHandler(authedReq({ method: 'POST', body: { analysisId: 'deadbeefdeadbeefdeadbeef' } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('eval-analysis-get / list', () => {
    it('get returns a stored analysis', async () => {
        getAnalysisMock.mockResolvedValue({ _id: 'a1', status: 'complete' });
        const res = makeRes();
        await getHandler(authedReq({ method: 'GET', query: { analysisId: 'deadbeefdeadbeefdeadbeef' } }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ analysis: { _id: 'a1', status: 'complete' } });
    });

    it('list requires a department and returns summaries', async () => {
        const res1 = makeRes();
        await listHandler(authedReq({ method: 'GET', query: {} }), res1);
        expect(res1.status).toHaveBeenCalledWith(400);

        listAnalysesMock.mockResolvedValue([{ _id: 'a1' }]);
        const res2 = makeRes();
        await listHandler(authedReq({ method: 'GET', query: { department: 'TBS-SCT' } }), res2);
        expect(listAnalysesMock).toHaveBeenCalledWith('TBS-SCT');
        expect(res2.status).toHaveBeenCalledWith(200);
        expect(res2.json).toHaveBeenCalledWith({ analyses: [{ _id: 'a1' }] });
    });
});
