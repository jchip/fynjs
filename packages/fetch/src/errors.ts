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

    let usableResponse: Response;
    try {
      const isNullBodyStatus = [204, 205, 304].includes(response.status);
      usableResponse = new Response(isNullBodyStatus ? null : bodyText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      Object.defineProperty(usableResponse, "url", { value: response.url });
      (usableResponse as any).text = async () => bodyText;
      (usableResponse as any).json = async () =>
        data !== undefined && typeof data === "object" ? data : JSON.parse(bodyText);
      (usableResponse as any).clone = () => {
        const cloned = new Response(isNullBodyStatus ? null : bodyText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        Object.defineProperty(cloned, "url", { value: response.url });
        (cloned as any).text = (usableResponse as any).text;
        (cloned as any).json = (usableResponse as any).json;
        return cloned;
      };
    } catch {
      usableResponse = response;
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
