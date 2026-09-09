import { parseDeadline } from "../src/common/time";

describe("deadline parsing", () => {
  it("treats date-only input as end of day in Asia/Ho_Chi_Minh", () => {
    expect(parseDeadline("2026-09-09").toISOString()).toBe(
      "2026-09-09T16:59:59.000Z",
    );
  });

  it("preserves explicit timezone offsets", () => {
    expect(parseDeadline("2026-09-09T12:30:00+07:00").toISOString()).toBe(
      "2026-09-09T05:30:00.000Z",
    );
  });
});
