import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/extension")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/subscribe",
      search,
      replace: true,
    });
  },
});
