import axios from 'axios';
import { Agent } from 'https';
import ServerLoggingService from './ServerLoggingService.js';

function getHttpsAgent() {
    return new Agent({ rejectUnauthorized: false });
}

function isKnown404(finalUrl) {
    return finalUrl.includes('404.html');
}

function getFinalUrl(response, url) {
    const final = response?.request?.res?.responseUrl || url;
    // Remove trailing slash for consistency
    return final.endsWith('/') && final.length > 1 ? final.slice(0, -1) : final;
}

function logCheck(url, response, method, chatId) {
    ServerLoggingService.info(
        `Checked URL: ${url} => ${response.status} (${getFinalUrl(response, url)}) [${method.toUpperCase()}]`,
        chatId || 'system',
        {
            url,
            status: response.status,
            finalUrl: getFinalUrl(response, url),
            method: method.toUpperCase(),
        }
    );
}

async function checkUrlWithMethod(url, method = 'head', chatId) {
    const httpsAgent = getHttpsAgent();
    let result = {
        isValid: false,
        status: null,
        finalUrl: url,
        error: null
    };
    try {
        const response = await axios({
            method,
            url,
            httpsAgent,
            maxRedirects: 10,
            timeout: 10000,
            headers: {
                'User-Agent': process.env.USER_AGENT || 'ai-answers',
            },
            validateStatus: () => true,
        });
        result.status = response.status;
        result.finalUrl = getFinalUrl(response, url);
        result.isValid = response.status === 200 && !isKnown404(result.finalUrl);
        logCheck(url, response, method, chatId);
        return result;
    } catch (error) {
        result.status = error.response?.status || 500;
        result.finalUrl = url;
        result.isValid = false;
        result.error = error.message || 'Unknown error';
        logCheck(url, error.response || { status: result.status }, method, chatId);
        return result;
    }
}

export const UrlValidationService = {
    async validateUrl(url, chatId) {
        let headResult = await checkUrlWithMethod(url, 'head', chatId);
        let result = headResult;

        if (!headResult.isValid) {
            let getResult = await checkUrlWithMethod(url, 'get', chatId);
            result = getResult;
        }

        return {
            isValid: result.isValid,
            url: result.finalUrl,
            status: result.status,
            confidenceRating: result.isValid ? 1 : 0,
            error: result.error || undefined
        };
    },

    // Expose internals for testing if needed
    __private__: { checkUrlWithMethod, isKnown404, getFinalUrl }
};
