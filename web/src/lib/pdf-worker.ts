// Stub for PDF.js worker in Vite/TypeScript environment
export const pdfjsLib: any = (typeof window !== 'undefined' && (window as any).pdfjsLib) || {
  getDocument: (_opts: any) => ({
    promise: Promise.reject(new Error('PDF dieline parser worker not loaded')),
  }),
  OPS: {},
};
