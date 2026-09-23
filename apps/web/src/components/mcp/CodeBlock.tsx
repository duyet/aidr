export function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="mt-2 max-w-3xl overflow-x-auto rounded-2xl border border-border/80 bg-card p-4 text-xs leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}
