import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { BaseLoader } from "hls.js";
import type { HlsConfig, LoaderResponse, RetryConfig } from "hls.js";
import { DESKTOP_USER_AGENT } from "../../../shared/network/desktopUserAgent";

// hls.js's built-in FetchLoader always calls the WebView's global `fetch`
// (see hls.js internals), which is exactly what's blocked by CORS for
// cross-origin IPTV stream servers that don't send
// Access-Control-Allow-Origin. This loader is a drop-in replacement that
// routes every manifest/playlist/fragment/key request through
// @tauri-apps/plugin-http's fetch instead — a native Rust HTTP client that
// isn't subject to WebView CORS enforcement.
//
// It extends hls.js's own exported BaseLoader (not reimplemented) so all
// timeout/retry orchestration (loadtimeout(), retry(), the requestTimeout/
// retryTimeout bookkeeping) stays exactly what hls.js already ships and
// tests — only the actual network call (loadInternal) and the small set of
// BaseLoader's abstract hooks are provided here.
//
// Scope deliberately narrowed vs. hls.js's FetchLoader: progressive
// (chunked/streaming) response reading is not implemented — responses are
// always awaited in full before being handed to hls.js. hls.js itself
// already accounts for this: enableStreamingMode() in hls.js's own config
// resolution only turns on progressive streaming for its own FetchLoader/
// XhrLoader, and explicitly disables it ("config.progressive = false") the
// moment it detects a custom `loader`, exactly as configured below. So this
// simplification doesn't fight the library — it's the codepath hls.js
// already has for any non-default loader.
class TauriFetchLoader extends BaseLoader {
  private response: Response | null = null;
  private controller: AbortController | null = null;

  // The HlsConfig argument is unused (this loader has nothing configurable
  // of its own, unlike hls.js's FetchLoader which reads config.fetchSetup),
  // but the constructor must still accept it — hls.js instantiates loaders
  // as `new config.loader(hlsConfig)`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: HlsConfig) {
    super();
  }

  protected loadInternal(): void {
    const { config, context } = this;
    if (!config || !context) return;

    const stats = this.stats;
    stats.loading.first = 0;
    stats.loaded = 0;
    stats.aborted = false;

    this.controller = new AbortController();

    const headers = new Headers(context.headers ?? {});
    // See shared/network/desktopUserAgent.ts: without this,
    // @tauri-apps/plugin-http's Rust backend sends "tauri-plugin-http/x.y.z"
    // as the User-Agent, which anti-bot/anti-hotlink IPTV hosts commonly
    // reject — a likely contributor to manifests/fragments hanging even
    // after the CORS-bypassing fetch bridge was introduced.
    headers.set("User-Agent", DESKTOP_USER_AGENT);
    if (context.rangeEnd) {
      headers.set("Range", `bytes=${context.rangeStart}-${context.rangeEnd - 1}`);
    }

    const { maxTimeToFirstByteMs, maxLoadTimeMs } = config.loadPolicy;
    const firstByteTimeout =
      maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs) ? maxTimeToFirstByteMs : maxLoadTimeMs;

    window.clearTimeout(this.requestTimeout);
    this.requestTimeout = window.setTimeout(() => this.loadtimeout(), firstByteTimeout);

    const isArrayBuffer = context.responseType === "arraybuffer";

    tauriFetch(context.url, {
      method: "GET",
      headers,
      signal: this.controller.signal,
    })
      .then((response) => {
        this.response = response;
        const first = Math.max(performance.now(), stats.loading.start);
        window.clearTimeout(this.requestTimeout);
        this.requestTimeout = window.setTimeout(
          () => this.loadtimeout(),
          maxLoadTimeMs - (first - stats.loading.start),
        );

        if (!response.ok) {
          throw new LoaderHttpError(response.statusText || "fetch, bad network response", response.status);
        }

        stats.loading.first = first;
        const contentLength = getContentLength(response.headers);
        if (contentLength) stats.total = contentLength;

        if (isArrayBuffer) return response.arrayBuffer();
        if (context.responseType === "json") return response.json();
        return response.text();
      })
      .then((data: LoaderResponse["data"]) => {
        const response = this.response;
        if (!response) throw new Error("loader destroyed");

        window.clearTimeout(this.requestTimeout);
        stats.loading.end = Math.max(performance.now(), stats.loading.first);

        const total = isArrayBuffer
          ? (data as ArrayBuffer).byteLength
          : typeof data === "string"
            ? data.length
            : undefined;
        if (total) stats.loaded = stats.total = total;

        const loaderResponse: LoaderResponse = {
          url: response.url,
          data,
          code: response.status,
        };
        // onProgress's type only allows string | ArrayBuffer — hls.js's own
        // FetchLoader passes the same responseData through unconditionally
        // regardless of responseType, so this narrows for the type checker
        // without changing the (already hls.js-matching) runtime behavior.
        this.callbacks?.onProgress?.(stats, context, data as string | ArrayBuffer, response);
        this.callbacks?.onSuccess(loaderResponse, stats, context, response);
      })
      .catch((error: unknown) => {
        window.clearTimeout(this.requestTimeout);
        if (stats.aborted) return;

        const code = error instanceof LoaderHttpError ? error.code : 0;
        const text = error instanceof Error ? error.message : String(error ?? "");

        const retryConfig = config.loadPolicy.errorRetry;
        if (shouldRetryRequest(retryConfig, stats.retry, false, code)) {
          this.retry(retryConfig as RetryConfig);
        } else {
          this.callbacks?.onError({ code, text }, context, this.response, stats);
        }
      });
  }

  protected abortInternal(): void {
    window.clearTimeout(this.retryTimeout);
    if (this.controller && !this.stats.loading.end) {
      this.stats.aborted = true;
      this.controller.abort();
    }
  }

  protected getNetworkDetails(): Response | null {
    return this.response;
  }

  protected resetInternalLoader(): void {
    this.response = null;
  }

  getCacheAge(): number | null {
    if (!this.response) return null;
    const age = this.response.headers.get("age");
    return age ? parseFloat(age) : null;
  }

  getResponseHeader(name: string): string | null {
    return this.response ? this.response.headers.get(name) : null;
  }

  destroy(): void {
    super.destroy();
    this.response = null;
    this.controller = null;
  }
}

class LoaderHttpError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

function getContentLength(headers: Headers): number | undefined {
  const contentLength = headers.get("Content-Length");
  return contentLength ? parseInt(contentLength, 10) : undefined;
}

// Mirrors hls.js's own (internal, unexported) retry policy check for the
// network-error path — see BaseLoader.loadtimeout()/retry() in hls.js for
// the equivalent, already-inherited handling of the timeout path.
function shouldRetryRequest(
  retryConfig: RetryConfig | null | undefined,
  retryCount: number,
  isTimeout: boolean,
  httpStatus: number | undefined,
): boolean {
  if (!retryConfig) return false;
  const retryableStatus =
    (httpStatus === 0 && typeof navigator !== "undefined" && navigator.onLine === false) ||
    (!!httpStatus && (httpStatus < 400 || httpStatus > 499));
  const retry = retryCount < retryConfig.maxNumRetry && (retryableStatus || isTimeout);
  return retryConfig.shouldRetry
    ? retryConfig.shouldRetry(retryConfig, retryCount, isTimeout, undefined, retry)
    : retry;
}

export { TauriFetchLoader };
