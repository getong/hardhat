import type UndiciT from "undici";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import querystring from "node:querystring";
import path from "node:path";
import { expectTypeOf } from "expect-type";
import { ProxyAgent, Pool, Agent, Client } from "undici";

import {
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_TIMEOUT_IN_MILLISECONDS,
  DEFAULT_USER_AGENT,
  getRequest,
  postJsonRequest,
  postFormRequest,
  download,
  getDispatcher,
} from "../src/request.js";
import { exists, readUtf8File } from "../src/fs.js";
import {
  getBaseDispatcherOptions,
  getBaseRequestOptions,
} from "../src/internal/request.js";
import { ensureError } from "../src/errors/catch-utils.js";
import {
  getTestDispatcherOptions,
  mockPool,
  setupRequestMocking,
} from "./helpers/request.js";
import { useTmpDir } from "./helpers/fs.js";

describe("Requests util", () => {
  describe("getDispatcher", () => {
    it("Should return a ProxyAgent dispatcher if a proxy url was provided", async () => {
      const url = "http://localhost";
      const options = getTestDispatcherOptions({
        proxy: "http://proxy",
      });
      const dispatcher = await getDispatcher(url, options);

      assert.ok(dispatcher instanceof ProxyAgent);
    });

    it("Should return a Pool dispatcher if pool is true", async () => {
      const url = "http://localhost";
      const options = getTestDispatcherOptions({
        pool: true,
      });
      const dispatcher = await getDispatcher(url, options);

      assert.ok(dispatcher instanceof Pool);
    });

    it("Should throw if both pool and proxy are set", async () => {
      const url = "http://localhost";
      const options = getTestDispatcherOptions({
        pool: true,
        proxy: "http://proxy",
      });

      await assert.rejects(getDispatcher(url, options), {
        name: "DispatcherError",
        message:
          "Failed to create dispatcher: The pool and proxy options can't be used at the same time",
      });
    });

    it("Should return an Agent dispatcher if proxy is not set and pool is false", async () => {
      const url = "http://localhost";
      const options = getTestDispatcherOptions({
        pool: false,
      });
      const dispatcher = await getDispatcher(url, options);

      assert.ok(dispatcher instanceof Agent);
    });

    it("Should return an Agent dispatcher if proxy is not set and pool is not set", async () => {
      const url = "http://localhost";
      const options = getTestDispatcherOptions();
      const dispatcher = await getDispatcher(url, options);

      assert.ok(dispatcher instanceof Agent);
    });

    describe("getBaseDispatcherOptions", () => {
      it("Should return the default options if no options are passed", () => {
        const expectedOptions = {
          headersTimeout: DEFAULT_TIMEOUT_IN_MILLISECONDS,
          bodyTimeout: DEFAULT_TIMEOUT_IN_MILLISECONDS,
          connectTimeout: DEFAULT_TIMEOUT_IN_MILLISECONDS,
          maxRedirections: DEFAULT_MAX_REDIRECTS,
        };
        const options = getBaseDispatcherOptions();

        expectTypeOf(options).toEqualTypeOf<UndiciT.Client.Options>();
        assert.deepEqual(options, expectedOptions);
      });

      it("Should return the options with the provided timeout", () => {
        const timeout = 1000;
        const expectedOptions = {
          headersTimeout: timeout,
          bodyTimeout: timeout,
          connectTimeout: timeout,
          maxRedirections: DEFAULT_MAX_REDIRECTS,
        };
        const options = getBaseDispatcherOptions(timeout);

        assert.deepEqual(options, expectedOptions);
      });

      it("Should return the options with the provided keepAliveTimeouts for tests", () => {
        const expectedOptions = {
          headersTimeout: DEFAULT_TIMEOUT_IN_MILLISECONDS,
          bodyTimeout: DEFAULT_TIMEOUT_IN_MILLISECONDS,
          connectTimeout: DEFAULT_TIMEOUT_IN_MILLISECONDS,
          maxRedirections: DEFAULT_MAX_REDIRECTS,
          keepAliveTimeout: 10,
          keepAliveMaxTimeout: 10,
        };
        const options = getBaseDispatcherOptions(undefined, true);

        assert.deepEqual(options, expectedOptions);
      });

      it("Should return the options with the provided keepAliveTimeouts for tests and the provided timeout", () => {
        const timeout = 1000;
        const expectedOptions = {
          headersTimeout: timeout,
          bodyTimeout: timeout,
          connectTimeout: timeout,
          maxRedirections: DEFAULT_MAX_REDIRECTS,
          keepAliveTimeout: 10,
          keepAliveMaxTimeout: 10,
        };
        const options = getBaseDispatcherOptions(timeout, true);

        assert.deepEqual(options, expectedOptions);
      });
    });
  });

  describe("getBaseRequestOptions", () => {
    it("Should return the default options if no options are passed", async () => {
      const url = "http://localhost";
      const expectedOptions = {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
        },
        throwOnError: true,
      };
      const { dispatcher, ...options } = await getBaseRequestOptions(url);

      assert.ok(dispatcher instanceof Agent);
      assert.deepEqual(options, expectedOptions);
    });

    it("Should add the Authorization header if the url has a username and password", async () => {
      const url = "http://user:password@localhost";
      const expectedHeaders = {
        "User-Agent": DEFAULT_USER_AGENT,
        Authorization: `Basic ${Buffer.from(`user:password`).toString(
          "base64",
        )}`,
      };
      const { headers } = await getBaseRequestOptions(url);

      assert.deepEqual(headers, expectedHeaders);
    });

    it("Should add extra headers", async () => {
      const url = "http://localhost";
      const extraHeaders = {
        "X-Custom-Header": "value",
      };
      const expectedHeaders = {
        "User-Agent": DEFAULT_USER_AGENT,
        "X-Custom-Header": "value",
      };
      const { headers } = await getBaseRequestOptions(url, { extraHeaders });

      assert.deepEqual(headers, expectedHeaders);
    });

    it("Should override the User-Agent header", async () => {
      const url = "http://localhost";
      const extraHeaders = {
        "User-Agent": "Custom",
      };
      const expectedHeaders = {
        "User-Agent": "Custom",
      };
      const { headers } = await getBaseRequestOptions(url, { extraHeaders });

      assert.deepEqual(headers, expectedHeaders);
    });

    it("Should return the provided dispatcher", async () => {
      const url = "http://localhost";
      const dispatcher = new Client(url);
      const { dispatcher: returnedDispatcher } = await getBaseRequestOptions(
        url,
        {},
        dispatcher,
      );

      assert.equal(dispatcher, returnedDispatcher);
    });

    it("Should return a dispatcher based on the provided options", async () => {
      const url = "http://localhost";
      const dispatcherOptions = getTestDispatcherOptions({ pool: true });
      const { dispatcher } = await getBaseRequestOptions(
        url,
        undefined,
        dispatcherOptions,
      );

      assert.ok(dispatcher instanceof Pool);
    });

    it("Should return the provided signal", async () => {
      const url = "http://localhost";
      const { signal } = new AbortController();
      const { signal: returnedSignal } = await getBaseRequestOptions(url, {
        abortSignal: signal,
      });

      assert.equal(returnedSignal, signal);
    });

    it("Should return the provided queryParams", async () => {
      const url = "http://localhost";
      const queryParams = {
        foo: "bar",
      };
      const { query: returnedQueryParams } = await getBaseRequestOptions(url, {
        queryParams,
      });

      assert.deepEqual(returnedQueryParams, queryParams);
    });
  });

  describe("getRequest", () => {
    setupRequestMocking();
    const url = "http://localhost:3000/";
    const baseInterceptorOptions = {
      path: "/",
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    };

    it("Should make a basic get request", async () => {
      mockPool.intercept(baseInterceptorOptions).reply(200, {});
      const response = await getRequest(url, undefined, mockPool);

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should make a get request with query parameters", async () => {
      const queryParams = {
        foo: "bar",
        baz: "qux",
      };
      mockPool
        .intercept({ ...baseInterceptorOptions, query: queryParams })
        .reply(200, {});
      const response = await getRequest(url, { queryParams }, mockPool);

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should make a get request with extra headers", async () => {
      const extraHeaders = {
        "X-Custom-Header": "value",
      };
      mockPool
        .intercept({
          ...baseInterceptorOptions,
          headers: { ...baseInterceptorOptions.headers, ...extraHeaders },
        })
        .reply(200, {});
      const response = await getRequest(url, { extraHeaders }, mockPool);

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should allow aborting a request using an abort signal", async () => {
      const abortController = new AbortController();
      mockPool.intercept(baseInterceptorOptions).reply(200, {});
      const requestPromise = getRequest(
        url,
        { abortSignal: abortController.signal },
        mockPool,
      );
      abortController.abort();

      await assert.rejects(requestPromise, (err) => {
        ensureError(err);
        ensureError(err.cause);
        assert.equal(err.cause.name, "AbortError");
        return true;
      });
    });

    it("Should throw if the request fails", async () => {
      mockPool
        .intercept(baseInterceptorOptions)
        .reply(500, "Internal Server Error");

      await assert.rejects(getRequest(url, undefined, mockPool), {
        name: "RequestError",
        message: `Failed to make GET request to ${url}`,
      });
    });
  });

  describe("postJsonRequest", () => {
    setupRequestMocking();
    const url = "http://localhost:3000/";
    const body = { foo: "bar" };
    const baseInterceptorOptions = {
      path: "/",
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
      },
    };

    it("Should make a basic post request", async () => {
      mockPool.intercept(baseInterceptorOptions).reply(200, {});
      const response = await postJsonRequest(url, body, undefined, mockPool);

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should make a post request with query parameters", async () => {
      const queryParams = {
        baz: "qux",
      };
      mockPool
        .intercept({
          ...baseInterceptorOptions,
          query: queryParams,
        })
        .reply(200, {});
      const response = await postJsonRequest(
        url,
        body,
        { queryParams },
        mockPool,
      );

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should make a post request with extra headers", async () => {
      const extraHeaders = {
        "X-Custom-Header": "value",
      };
      mockPool
        .intercept({
          ...baseInterceptorOptions,
          headers: { ...baseInterceptorOptions.headers, ...extraHeaders },
        })
        .reply(200, {});
      const response = await postJsonRequest(
        url,
        body,
        { extraHeaders },
        mockPool,
      );

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should allow aborting a request using an abort signal", async () => {
      const abortController = new AbortController();
      mockPool.intercept(baseInterceptorOptions).reply(200, {});
      const requestPromise = postJsonRequest(
        url,
        body,
        { abortSignal: abortController.signal },
        mockPool,
      );
      abortController.abort();

      await assert.rejects(requestPromise, (err) => {
        ensureError(err);
        ensureError(err.cause);
        assert.equal(err.cause.name, "AbortError");
        return true;
      });
    });

    it("Should throw if the request fails", async () => {
      mockPool
        .intercept(baseInterceptorOptions)
        .reply(500, "Internal Server Error");

      await assert.rejects(postJsonRequest(url, body, undefined, mockPool), {
        name: "RequestError",
        message: `Failed to make POST request to ${url}`,
      });
    });
  });

  describe("postFormRequest", () => {
    setupRequestMocking();
    const url = "http://localhost:3000/";
    const body = { foo: "bar" };
    const baseInterceptorOptions = {
      path: "/",
      method: "POST",
      body: querystring.stringify(body),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": DEFAULT_USER_AGENT,
      },
    };

    it("Should make a basic post request", async () => {
      mockPool.intercept(baseInterceptorOptions).reply(200, {});
      const response = await postFormRequest(url, body, undefined, mockPool);

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should make a post request with query parameters", async () => {
      const queryParams = {
        baz: "qux",
      };
      mockPool
        .intercept({
          ...baseInterceptorOptions,
          query: queryParams,
        })
        .reply(200, {});
      const response = await postFormRequest(
        url,
        body,
        { queryParams },
        mockPool,
      );

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should make a post request with extra headers", async () => {
      const extraHeaders = {
        "X-Custom-Header": "value",
      };
      mockPool
        .intercept({
          ...baseInterceptorOptions,
          headers: { ...baseInterceptorOptions.headers, ...extraHeaders },
        })
        .reply(200, {});
      const response = await postFormRequest(
        url,
        body,
        { extraHeaders },
        mockPool,
      );

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      await response.body.json();
    });

    it("Should allow aborting a request using an abort signal", async () => {
      const abortController = new AbortController();
      mockPool.intercept(baseInterceptorOptions).reply(200, {});
      const requestPromise = postFormRequest(
        url,
        body,
        { abortSignal: abortController.signal },
        mockPool,
      );
      abortController.abort();

      await assert.rejects(requestPromise, (err) => {
        ensureError(err);
        ensureError(err.cause);
        assert.equal(err.cause.name, "AbortError");
        return true;
      });
    });

    it("Should throw if the request fails", async () => {
      mockPool
        .intercept(baseInterceptorOptions)
        .reply(500, "Internal Server Error");

      await assert.rejects(postFormRequest(url, body, undefined, mockPool), {
        name: "RequestError",
        message: `Failed to make POST request to ${url}`,
      });
    });
  });

  describe("download", () => {
    const getTmpDir = useTmpDir("request");
    setupRequestMocking();
    const url = "http://localhost:3000/";
    const baseInterceptorOptions = {
      path: "/",
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    };

    it("Should download a file", async () => {
      const destination = path.join(getTmpDir(), "file.txt");
      mockPool.intercept(baseInterceptorOptions).reply(200, "file content");
      await download(url, destination, undefined, mockPool);

      assert.ok(exists(destination));
      assert.equal(await readUtf8File(destination), "file content");
    });

    it("Should throw if the request fails", async () => {
      const destination = path.join(getTmpDir(), "file.txt");
      mockPool
        .intercept(baseInterceptorOptions)
        .reply(500, "Internal Server Error");

      await assert.rejects(download(url, destination, undefined, mockPool), {
        name: "DownloadError",
        message: `Failed to download file from ${url}.`,
      });
    });
  });
});
