import axios from 'axios';

const API_BASE = '/api/experimental';

export const ExperimentalBatchClientService = {
    /**
     * Create a new experimental batch
     * @param {object} data { name, description, type, config, items }
     */
    async createBatch(data) {
        const response = await axios.post(`${API_BASE}/batch-create`, data);
        return response.data;
    },

    /**
     * List experimental batches
     * @param {number} page 
     * @param {number} limit 
     * @param {string} type 
     */
    async listBatches(page = 1, limit = 20, type = null) {
        const params = { page, limit };
        if (type) params.type = type;
        const response = await axios.get(`${API_BASE}/batch-list`, { params });
        return response.data;
    },

    /**
     * Get batch status and items
     * @param {string} id 
     * @param {boolean} includeItems 
     * @param {number} page 
     * @param {number} limit 
     */
    async getBatchStatus(id, includeItems = false, page = 1, limit = 50) {
        const response = await axios.get(`${API_BASE}/batch-status/${id}`, {
            params: { items: includeItems, page, limit }
        });
        return response.data;
    },

    /**
     * Trigger processing for a batch
     * @param {string} id 
     */
    async processBatch(id) {
        const response = await axios.post(`${API_BASE}/batch-process/${id}`);
        return response.data;
    },

    /**
     * Cancel a running batch
     * @param {string} id 
     */
    async cancelBatch(id) {
        const response = await axios.post(`${API_BASE}/batch-cancel/${id}`);
        return response.data;
    },

    /**
     * Export batch results
     * @param {string} id 
     */
    async exportBatch(id) {
        const response = await axios.get(`${API_BASE}/batch-export/${id}`);
        return response.data;
    },

    /**
     * Delete a batch
     * @param {string} id 
     */
    async deleteBatch(id) {
        const response = await axios.delete(`${API_BASE}/batch-delete/${id}`);
        return response.data;
    },

    /**
     * List available analyzers
     */
    async listAnalyzers() {
        const response = await axios.get(`${API_BASE}/analyzers`);
        return response.data;
    },

    /**
     * Upload a dataset from base64 string
     */
    async uploadDataset(fileContent, mimetype, fileName, metadata) {
        const response = await axios.post(`${API_BASE}/dataset-upload`, {
            fileContent, mimetype, fileName, metadata
        });
        return response.data;
    },

    /**
     * List datasets
     */
    async listDatasets(page = 1, limit = 20) {
        const response = await axios.get(`${API_BASE}/dataset-list`, { params: { page, limit } });
        return response.data;
    },

    /**
     * Delete a dataset
     */
    async deleteDataset(id, force = false) {
        const response = await axios.delete(`${API_BASE}/dataset-delete/${id}`, { params: { force } });
        return response.data;
    },

    /**
     * Promote a batch to a dataset
     */
    async promoteBatch(id, details) {
        const response = await axios.post(`${API_BASE}/batch-promote/${id}`, details);
        return response.data;
    },

    /**
     * Get SSE progress URL
     */
    getBatchProgressUrl(id) {
        return `${API_BASE}/batch-progress/${id}`;
    }
};
