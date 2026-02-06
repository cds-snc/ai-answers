import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

const ClientLoggingService = {
    info: async (chatId, message, data = {}) => {
        try {
            await AuthService.fetch(getApiUrl('db-log'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    level: 'info',
                    chatId,
                    message,
                    data,
                    timestamp: new Date().toISOString()
                }),
            });
        } catch (error) {
            console.error('Failed to log to server:', error);
        }
    },

    error: async (chatId, message, data = {}) => {
        try {
            await AuthService.fetch(getApiUrl('db-log'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    level: 'error',
                    chatId,
                    message,
                    data,
                    timestamp: new Date().toISOString()
                }),
            });
        } catch (error) {
            console.error('Failed to log error to server:', error);
        }
    }
};

export default ClientLoggingService;
