export function PreviewFrame({ previewHtml }: { previewHtml: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">Preview</h2>
      <iframe
        title="Email preview"
        className="h-[520px] w-full rounded-md border border-border bg-white"
        sandbox=""
        srcDoc={
          previewHtml ||
          "<p style='font-family:sans-serif;color:#737373;padding:24px'>Preview to see the Cursor-clean layout.</p>"
        }
      />
    </section>
  );
}
