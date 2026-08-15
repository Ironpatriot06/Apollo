export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(path, "http://localhost");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  const query = url.searchParams.toString();
  const requestPath = query ? `${path}?${query}` : path;

  const response = await fetch(requestPath, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}
