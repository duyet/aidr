import type { Template } from "./lib";

export function TemplatePicker({
  templates,
  templateId,
  template,
  onApply,
}: {
  templates: Template[];
  templateId: string;
  template: Template | undefined;
  onApply: (next: Template) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {templates.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onApply(item)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              item.id === templateId
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:bg-muted"
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>
      {template && (
        <p className="text-sm text-muted-foreground">{template.description}</p>
      )}
    </>
  );
}
