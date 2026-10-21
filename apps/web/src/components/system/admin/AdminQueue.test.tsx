/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_REVIEW_ATTEMPTS } from "../../../lib/submission-review";
import { AdminQueue } from "./AdminQueue";
import type { QueueSubmission } from "./lib";

afterEach(cleanup);

function sub(id: string, reviewAttempts: number): QueueSubmission {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Story ${id}`,
    note: null,
    user_name: null,
    rating: null,
    created_at: 1,
    review_attempts: reviewAttempts,
  };
}

describe("AdminQueue submissions", () => {
  it("flags only submissions parked after repeated review failures", () => {
    render(
      <AdminQueue
        suggestions={[]}
        submissions={[
          sub("ok", MAX_REVIEW_ATTEMPTS - 1),
          sub("parked", MAX_REVIEW_ATTEMPTS),
        ]}
        busy={false}
        actionBusyId={null}
        onRefresh={() => {}}
        onDecide={() => {}}
      />
    );
    const badges = screen.getAllByText(/review failed/);
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe(
      `review failed ${MAX_REVIEW_ATTEMPTS} times`
    );
  });
});
