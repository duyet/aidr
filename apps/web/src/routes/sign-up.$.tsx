import { Card, CardContent } from "@aidr/ui";
import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-up/$")({
  component: Page,
});

function Page() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-12">
      <Card className="w-full max-w-md border-border shadow-none">
        <CardContent className="flex justify-center p-6">
          <SignUp />
        </CardContent>
      </Card>
    </div>
  );
}
