import { logWithTime, isRetryableError } from './utils';

export const MAX_RETRY_COUNT = 5;
export const RETRY_DELAY = 1000;

/**
 * 带重试机制的通用API请求函数
 */
export async function apiRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    operationName: string,
    maxRetries: number = MAX_RETRY_COUNT
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await requestFn();
            if (attempt > 1) {
                logWithTime(`${operationName} 在第${attempt}次尝试后成功`);
            }
            return result;
        } catch (error) {
            lastError = error;
            logWithTime(`${operationName} 第${attempt}次尝试失败: ${String(error)}`);

            if (attempt < maxRetries) {
                const delay = RETRY_DELAY * attempt;
                logWithTime(`等待${delay}ms后进行第${attempt + 1}次重试`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`${operationName} 在${maxRetries}次重试后仍然失败: ${String(lastError)}`);
}























