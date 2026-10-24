/** Retry only a transient storage completion conflict, never a draft edit conflict or validation failure. */
export async function retryUploadCompletion<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
      if (attempt >= 2 || response?.status !== 409 ||
        !['UPLOAD_FINALIZING', 'UPLOAD_CHANGED'].includes(response.data?.code ?? '')) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.floor(Math.random() * 100)));
    }
  }
}
