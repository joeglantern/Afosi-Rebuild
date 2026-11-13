// Types for src/markdown.js, which the admin dashboard (TypeScript) imports
// for its live preview.

export interface RenderOptions {
  /** Rewrite an image address (already checked safe) before it is used, e.g. through a resize proxy. */
  imageSrc?: (url: string, width: number) => string;
  /** Prefix for heading anchor ids. */
  idPrefix?: string;
}

export function escapeHtml(value: unknown): string;
export function safeUrl(raw: unknown, options?: { image?: boolean }): string | null;
export function slugifyHeading(text: string): string;
export function renderMarkdown(source: string | null | undefined, options?: RenderOptions): string;
export function markdownToText(source: string | null | undefined, maxLength?: number): string;
