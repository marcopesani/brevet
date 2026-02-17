import { baseURL } from "@/../baseUrl";

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <IframeBootstrap baseUrl={baseURL} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function IframeBootstrap({ baseUrl }: { baseUrl: string }) {
  return (
    <>
      <base href={baseUrl} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__baseUrl=${JSON.stringify(baseUrl)};`,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `(${iframePatchFn.toString()})()`,
        }}
      />
    </>
  );
}

function iframePatchFn() {
  const baseUrl: string = (window as unknown as Record<string, unknown>).__baseUrl as string;
  const htmlElement = document.documentElement;
  const isInIframe = window.self !== window.top;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target === htmlElement) {
        const attr = mutation.attributeName;
        if (attr && attr !== "suppresshydrationwarning" && attr !== "lang") {
          htmlElement.removeAttribute(attr);
        }
      }
    }
  });
  observer.observe(htmlElement, { attributes: true, attributeOldValue: true });

  const origReplace = history.replaceState.bind(history);
  history.replaceState = function (
    _state: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try {
      const u = new URL(String(url ?? ""), window.location.href);
      origReplace(null, unused, u.pathname + u.search + u.hash);
    } catch {
      /* SecurityError in sandboxed iframe */
    }
  };

  const origPush = history.pushState.bind(history);
  history.pushState = function (
    _state: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try {
      const u = new URL(String(url ?? ""), window.location.href);
      origPush(null, unused, u.pathname + u.search + u.hash);
    } catch {
      /* SecurityError in sandboxed iframe */
    }
  };

  if (isInIframe && window.location.origin !== new URL(baseUrl).origin) {
    const appOrigin = new URL(baseUrl).origin;
    const originalFetch = window.fetch.bind(window);

    window.fetch = function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      let url: URL;
      if (typeof input === "string" || input instanceof URL) {
        url = new URL(String(input), window.location.href);
      } else {
        url = new URL(input.url, window.location.href);
      }

      if (url.origin === appOrigin || url.origin === window.location.origin) {
        const rewritten = new URL(baseUrl);
        rewritten.pathname = url.pathname;
        rewritten.search = url.search;
        rewritten.hash = url.hash;

        const newInput =
          typeof input === "string" || input instanceof URL
            ? rewritten.toString()
            : new Request(rewritten.toString(), input);

        return originalFetch(newInput, { ...init, mode: "cors" });
      }

      return originalFetch(input, init);
    } as typeof fetch;
  }
}
