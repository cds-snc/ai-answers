import AuthService from '../AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';

export const ExperimentalBatchClientService = {
    /**
     * Create a new experimental batch
     * @param {object} data { name, description, type, config, items }
     */
    async createBatch(data) {
        const url = getApiUrl('experimental-batch-create');
        const res = await AuthService.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            // Throw an object with `code` so the frontend can map it to a
            // translation key. Falls back to a plain Error when the body is
            // not JSON or has no code.
            if (errBody?.code) {
                const err = new Error(errBody.error || 'Failed to create batch');
                err.code = errBody.code;
                throw err;
            }
            throw new Error(`Failed to create batch: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * List experimental batches
     * @param {number} page 
     * @param {number} limit 
     * @param {string} type 
     */
    async listBatches(page = 1, limit = 20, type = null, datasetId = null) {
        let url = getApiUrl(`experimental-batch-list?page=${page}&limit=${limit}`);
        if (type) url += `&type=${encodeURIComponent(type)}`;
        if (datasetId) url += `&datasetId=${encodeURIComponent(datasetId)}`;
        const res = await AuthService.fetch(url);
        if (!res.ok) throw new Error(`Failed to list batches: ${res.status} ${res.statusText}`);
        return await res.json();
    },

    /**
     * Get batch status and items
     * @param {string} id 
     * @param {boolean} includeItems 
     * @param {number} page 
     * @param {number} limit 
     */
    async getBatchStatus(id, includeItems = false, page = 1, limit = 50) {
        const url = getApiUrl(`experimental-batch-status/${encodeURIComponent(id)}?items=${includeItems}&page=${page}&limit=${limit}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to get batch status: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Get paginated items for a batch (results drill-down)
     * @param {string} id
     * @param {object} options { page, limit, filter } filter: 'all' | 'attention' | 'errors'
     */
    async getBatchItems(id, { page = 1, limit = 25, filter = 'all', row = null } = {}) {
        const query = new URLSearchParams({ page: String(page), limit: String(limit), filter });
        if (row) query.set('row', String(row));
        const url = getApiUrl(`experimental-batch-items/${encodeURIComponent(id)}?${query.toString()}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to get batch items: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Trigger processing for a batch
     * @param {string} id
     */
    async processBatch(id, force = false) {
        const url = getApiUrl(`experimental-batch-process/${encodeURIComponent(id)}${force ? '?force=true' : ''}`);
        const res = await AuthService.fetch(url, { method: 'POST' });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to process batch: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Cancel a running batch
     * @param {string} id 
     */
    async cancelBatch(id) {
        const url = getApiUrl(`experimental-batch-cancel/${encodeURIComponent(id)}`);
        const res = await AuthService.fetch(url, { method: 'POST' });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to cancel batch: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Export batch results
     * @param {string} id 
     * @param {string} format 'json' or 'excel'
     */
    async exportBatch(id, format = 'json') {
        const url = getApiUrl(`experimental-batch-export/${encodeURIComponent(id)}?format=${format}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) throw new Error(`Failed to export batch: ${res.status} ${res.statusText}`);
        if (format === 'excel') {
            return await res.blob();
        }
        return await res.json();
    },

    async exportChatLogs(id, baselineRunId = '') {
        const query = new URLSearchParams();
        if (baselineRunId) {
            query.set('baselineRunId', baselineRunId);
        }

        const url = getApiUrl(`experimental-batch-chat-logs-export/${encodeURIComponent(id)}${query.toString() ? `?${query.toString()}` : ''}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to export chat logs: ${res.status} ${res.statusText}`);
        }

        return await res.blob();
    },

    /**
     * Delete a batch
     * @param {string} id 
     */
    async deleteBatch(id) {
        const url = getApiUrl(`experimental-batch-delete/${encodeURIComponent(id)}`);
        const res = await AuthService.fetch(url, { method: 'DELETE' });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to delete batch: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * List available analyzers
     */
    async listAnalyzers() {
        const url = getApiUrl('experimental-analyzers');
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to list analyzers: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Upload a dataset from base64 string
     */
    async uploadDataset(fileContent, mimetype, fileName, metadata) {
        const url = getApiUrl('experimental-dataset-upload');
        const res = await AuthService.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileContent, mimetype, fileName, metadata })
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `Failed to upload dataset: ${res.status} ${res.statusText}`);
            err.response = { data: errBody };
            throw err;
        }
        return await res.json();
    },

    /**
     * List datasets
     */
    async listDatasets(page = 1, limit = 20) {
        const url = getApiUrl(`experimental-dataset-list?page=${page}&limit=${limit}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to list datasets: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    async previewGoldenAnswerDataset(startDate, endDate) {
        const params = new URLSearchParams({ startDate, endDate });
        const res = await AuthService.fetch(getApiUrl(`experimental-golden-answer-dataset?${params}`));
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to preview golden answer dataset: ${res.status}`);
        }
        return await res.json();
    },

    async createGoldenAnswerDataset({ startDate, endDate, name, description, method, type, category }) {
        const res = await AuthService.fetch(getApiUrl('experimental-golden-answer-dataset'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate, name, description, method, type, category })
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `Failed to create golden answer dataset: ${res.status}`);
            err.response = { data: errBody };
            throw err;
        }
        return await res.json();
    },

    async previewInstantAnswerDataset(startDate, endDate, occurrencesPerQuestion) {
        const params = new URLSearchParams({ startDate, endDate, occurrencesPerQuestion: String(occurrencesPerQuestion) });
        const res = await AuthService.fetch(getApiUrl(`experimental-instant-answer-dataset?${params}`));
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to preview instant answer dataset: ${res.status}`);
        }
        return await res.json();
    },

    async createInstantAnswerDataset(data) {
        const res = await AuthService.fetch(getApiUrl('experimental-instant-answer-dataset'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `Failed to create instant answer dataset: ${res.status}`);
            err.response = { data: errBody };
            throw err;
        }
        return await res.json();
    },

    /**
     * Delete a dataset
     */
    async deleteDataset(id, force = false) {
        const url = getApiUrl(`experimental-dataset-delete/${encodeURIComponent(id)}?force=${force}`);
        const res = await AuthService.fetch(url, { method: 'DELETE' });
        if (!res.ok) {
            // Re-throw full response for UI error handling (e.g. IN_USE code)
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `Failed to delete dataset`);
            err.response = { data: errBody };
            throw err;
        }
        return await res.json();
    },

    /**
     * Export a dataset as CSV
     */
    async exportDataset(id) {
        const url = getApiUrl(`experimental-dataset-export?${new URLSearchParams({ id }).toString()}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to export dataset: ${res.status} ${res.statusText}`);
        }
        return await res.blob();
    },

    /**
     * Get rows for a specific dataset
     */
    async getDatasetRows(id, page = 1, limit = 50) {
        const url = getApiUrl(`experimental-dataset-rows?id=${encodeURIComponent(id)}&page=${page}&limit=${limit}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to get dataset rows: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Get the suite grid (runs x tests verdict matrix) for a dataset
     */
    async getSuiteGrid(datasetId) {
        const url = getApiUrl(`experimental-suite-grid?datasetId=${encodeURIComponent(datasetId)}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to load suite grid: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    },

    /**
     * Get SSE progress URL
     */
    getBatchProgressUrl(id) {
        return getApiUrl(`experimental-batch-progress/${encodeURIComponent(id)}`);
    }
};
