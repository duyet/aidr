import { Card, CardContent } from "@aidr/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useClerkModule } from "../lib/clerk-user";

export const Route = createFileRoute("/sign-up/$")({
  component: Page,
});

function Page() {
  // Clerk loads after first paint via ClerkRootProvider; <SignUp> needs its
  // provider context, so render the shared module's component once ready.
  const { mod } = useClerkModule();
  const SignUp = mod?.SignUp;

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-12">
      <Card className="w-full max-w-md border-border shadow-none">
        <CardContent className="flex justify-center p-6">
          {SignUp ? <SignUp /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
