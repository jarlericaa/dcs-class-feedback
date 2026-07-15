import { describe, it, expect } from "vitest";

describe("Database Package", () => {
  it("should export prisma client", () => {
    const client = require("./client").prisma;
    expect(client).toBeDefined();
  });
});
