import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old URL: the form now lives at /contribute/new (history at /contribute).
 *  Kept as a redirect so shared and llms.txt links keep working. */
export const Route = createFileRoute("/submit")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/contribute/new", search, statusCode: 301 });
  },
});
