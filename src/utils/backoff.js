export async function exponentialBackoff(fn, retries = 10, initialDelay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        const currentDelay = initialDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
      } else {
        throw error;
      }
    }
  }
}
