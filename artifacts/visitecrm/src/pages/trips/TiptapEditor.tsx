import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export function TiptapEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value && value !== undefined) {
      editor.commands.setContent(value);
    }
  }, [value]);

  if (!editor) return null;
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex gap-1 border-b bg-muted/50 p-1 flex-wrap">
        {[
          { label: "N", cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), title: "Negrito" },
          { label: "I", cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), title: "Itálico" },
          { label: "S̶", cmd: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike"), title: "Tachado" },
        ].map(btn => (
          <button key={btn.title} title={btn.title} type="button"
            className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${btn.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={btn.cmd}
          >
            {btn.label}
          </button>
        ))}
        <div className="w-px bg-border mx-0.5" />
        {[
          { label: "H1", cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }), title: "Título 1" },
          { label: "H2", cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }), title: "Título 2" },
        ].map(btn => (
          <button key={btn.title} title={btn.title} type="button"
            className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${btn.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={btn.cmd}
          >
            {btn.label}
          </button>
        ))}
        <div className="w-px bg-border mx-0.5" />
        <button title="Lista com marcadores" type="button"
          className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${editor.isActive("bulletList") ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Lista
        </button>
        <button title="Lista numerada" type="button"
          className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${editor.isActive("orderedList") ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Lista
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 min-h-[120px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]"
      />
    </div>
  );
}
