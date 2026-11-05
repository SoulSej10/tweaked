/** The few parts of Vercel's request/response objects these functions use (typed locally to avoid a dev dependency). */
export interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

export interface ApiResponse {
  status(code: number): ApiResponse
  setHeader(name: string, value: string): ApiResponse
  json(body: unknown): void
}
