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
            className={item.id === templateId ? "btn-primary" : "btn-soft"}
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
