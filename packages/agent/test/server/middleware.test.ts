/**
 * Middleware 测试
 */

import { describe, it, expect } from "vitest"
import {
  matchRoute,
  parseQuery,
} from "../../src/server/middleware"

describe("matchRoute", () => {
  it("should match exact routes", () => {
    expect(matchRoute("/health", "/health")).toEqual({})
    expect(matchRoute("/sessions", "/sessions")).toEqual({})
  })

  it("should match routes with parameters", () => {
    expect(matchRoute("/sessions/:id", "/sessions/abc123")).toEqual({ id: "abc123" })
    expect(matchRoute("/sessions/:id/messages", "/sessions/abc123/messages")).toEqual({
      id: "abc123",
    })
  })

  it("should match routes with multiple parameters", () => {
    expect(matchRoute("/users/:userId/posts/:postId", "/users/1/posts/2")).toEqual({
      userId: "1",
      postId: "2",
    })
  })

  it("should return null for non-matching routes", () => {
    expect(matchRoute("/sessions/:id", "/users/abc")).toBeNull()
    expect(matchRoute("/sessions/:id", "/sessions")).toBeNull()
    expect(matchRoute("/sessions/:id", "/sessions/abc/extra")).toBeNull()
  })

  it("should handle query strings", () => {
    expect(matchRoute("/sessions/:id", "/sessions/abc?foo=bar")).toEqual({ id: "abc" })
  })
})

describe("parseQuery", () => {
  it("should parse query parameters", () => {
    expect(parseQuery("/path?foo=bar")).toEqual({ foo: "bar" })
    expect(parseQuery("/path?foo=bar&baz=qux")).toEqual({ foo: "bar", baz: "qux" })
  })

  it("should handle empty values", () => {
    expect(parseQuery("/path?foo=")).toEqual({ foo: "" })
    expect(parseQuery("/path?foo")).toEqual({ foo: "" })
  })

  it("should handle URL encoding", () => {
    expect(parseQuery("/path?foo=hello%20world")).toEqual({ foo: "hello world" })
    expect(parseQuery("/path?foo%3Dbar=value")).toEqual({ "foo=bar": "value" })
  })

  it("should return empty object for no query", () => {
    expect(parseQuery("/path")).toEqual({})
    expect(parseQuery("/path?")).toEqual({})
  })
})
