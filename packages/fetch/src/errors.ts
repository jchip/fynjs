export class HttpError extends Error {
  readonly response: Response;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  data?: any;

  constructor(response: Response, message?: string, data?: any) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    super(message ?? `HTTP ${response.status}${statusText} for ${response.url}`);
    this.name = "HttpError";
    this.response = response;
    this.status = response.status;
    this.statusText = response.statusText;
    this.url = response.url;
    this.data = data;
  }

  static async fromResponse(response: Response, message?: string): Promise<HttpError> {
    let bodyText = "";
    let data: any = undefined;
    if (!response.bodyUsed) {
      try {
        bodyText = await response.text();
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            data = JSON.parse(bodyText);
          } catch {
            data = bodyText;
          }
        } else {
          data = bodyText;
        }
      } catch {
        // Failed to read body
      }
    }

    // The buffered body is already decoded, so entity headers describing the
    // original transfer encoding / length no longer apply to it.
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");

    const readBody = async () => bodyText;
    const readJson = async () =>
      data !== undefined && typeof data === "object" ? data : JSON.parse(bodyText);

    let usableResponse: Response;
    try {
      const isNullBodyStatus = [204, 205, 304].includes(response.status);
      const build = () => {
        const built = new Response(isNullBodyStatus ? null : bodyText, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        Object.defineProperty(built, "url", { value: response.url });
        (built as any).text = readBody;
        (built as any).json = readJson;
        return built;
      };
      usableResponse = build();
      (usableResponse as any).clone = () => {
        const cloned = build();
        (cloned as any).clone = (usableResponse as any).clone;
        return cloned;
      };
    } catch {
      // `new Response` rejects statuses outside 200-599. Fall back to the
      // original response, whose body is already consumed, so patch the
      // readers onto it to keep err.response.text()/json() usable.
      usableResponse = response;
      (usableResponse as any).text = readBody;
      (usableResponse as any).json = readJson;
      (usableResponse as any).clone = () => usableResponse;
    }

    return new HttpError(usableResponse, message, data);
  }
}

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message?: string) {
    super(message ?? `Request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
