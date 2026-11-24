import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAndSynthesizeMock = vi.fn();
const getAnalysisMock = vi.fn();
const listAnalysesMock = vi.fn();

vi.mock('../services/EvalAnalysisService.js', () => ({
    __esModule: true,
    default: {
        createAndSynthesize: (...args) => createAndSynthesizeMock(...args),
        getAnalysis: (...args) => getAnalysisMock(...args),
        listAnalyses: (...args) => listAnalysesMock(...args)
    }
}));

import runHandler from '../api/eval/eval-analysis-run.js';
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

describe('eval-analysis-run', () => {
    it('runs the analysis in one request and passes the requesting user email', async () => {
        createAndSynthesizeMock.mockResolvedValue({ _id: 'a1', status: 'complete' });
        const res = makeRes();
        await runHandler(authedReq({
            method: 'POST',
            body: { filters: { department: 'TBS-SCT' }, language: 'fr' }
        }), res);
        expect(createAndSynthesizeMock).toHaveBeenCalledWith({
            filters: { department: 'TBS-SCT' },
            language: 'fr',
            requestedBy: 'lead@dept.gc.ca'
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ analysis: { _id: 'a1', status: 'complete' } });
    });

    it('returns a failed insights call as a 200 with the error-status doc', async () => {
        createAndSynthesizeMock.mockResolvedValue({ _id: 'a1', status: 'error', stats: { total: 3 } });
        const res = makeRes();
        await runHandler(authedReq({ method: 'POST', body: { filters: { department: 'TBS-SCT' } } }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ analysis: { _id: 'a1', status: 'error', stats: { total: 3 } } });
    });

    it('maps a missing department to 400 with its code', async () => {
        const err = new Error('An institution (department) filter is required');
        err.code = 'departmentRequired';
        createAndSynthesizeMock.mockRejectedValue(err);
        const res = makeRes();
        await runHandler(authedReq({ method: 'POST', body: { filters: {} } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'departmentRequired' }));
    });

    it('returns 500 for unexpected errors', async () => {
        createAndSynthesizeMock.mockRejectedValue(new Error('boom'));
        const res = makeRes();
        await runHandler(authedReq({ method: 'POST', body: { filters: { department: 'TBS-SCT' } } }), res);
        expect(res.status).toHaveBeenCalledWith(500);
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
