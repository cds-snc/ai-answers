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
        if (!res.ok) throw new Error(`Failed to create batch: ${res.status} ${res.statusText}`);
        return await res.json();
    },

    /**
     * List experimental batches
     * @param {number} page 
     * @param {number} limit 
     * @param {string} type 
     */
    async listBatches(page = 1, limit = 20, type = null) {
        let url = getApiUrl(`experimental-batch-list?page=${page}&limit=${limit}`);
        if (type) url += `&type=${encodeURIComponent(type)}`;
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
     * Trigger processing for a batch
     * @param {string} id 
     */
    async processBatch(id) {
        const url = getApiUrl(`experimental-batch-process/${encodeURIComponent(id)}`);
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
     */
    async exportBatch(id) {
        const url = getApiUrl(`experimental-batch-export/${encodeURIComponent(id)}`);
        const res = await AuthService.fetch(url);
        if (!res.ok) throw new Error(`Failed to export batch: ${res.status} ${res.statusText}`);
        return await res.json();
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
     * Promote a batch to a dataset
     */
    async promoteBatch(id, details) {
        const url = getApiUrl(`experimental-batch-promote/${encodeURIComponent(id)}`);
        const res = await AuthService.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details)
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `Failed to promote batch`);
            err.response = { data: errBody };
            throw err;
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
