export async function exponentialBackoff(fn, retries = 3, baseDelay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) {
            throw error;
        }
        const delay = baseDelay * (Math.pow(2, 3 - retries)); // 1000, 2000, 4000
        await new Promise(resolve => setTimeout(resolve, delay));
        return exponentialBackoff(fn, retries - 1, baseDelay);
    }
}
