import { expect, it } from "vitest";
import { VERSION } from "../src/index.js";

it("setup: the engine loads", () => {
  expect(VERSION).toBe("0.0.0");
});
