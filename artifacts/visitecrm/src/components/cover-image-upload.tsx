import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { useUploadImage } from "@/hooks/use-upload";

interface CoverImageUploadProps {
  fileSizeMB?: string;
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  previewClassName?: string;
  emptyLabel?: string;
  placeholder?: string;
  objectFit?: "contain" | "cover";
}

export function CoverImageUpload({
  fileSizeMB = "8",
  value,
  onChange,
  onUploadingChange,
  disabled,
  previewClassName = "h-48",
  emptyLabel,
  placeholder,
  objectFit = "contain",
}: CoverImageUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { startUpload, isUploading } = useUploadImage({
    onBegin: () => onUploadingChange?.(true),
    onComplete: (result) => {
      onUploadingChange?.(false);
      onChange(result.url);
    },
    onError: (err) => {
      onUploadingChange?.(false);
      toast({ title: `Erro no upload: ${err.message}`, variant: "destructive" });
    },
  });

  const upload = (file: File) => startUpload(file);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    upload(file);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const handleRemove = () => onChange("");

  const labelText = emptyLabel ?? placeholder ?? "Clique ou arraste a imagem aqui";

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {value ? (
        <div className={`relative rounded-lg overflow-hidden bg-muted group ${previewClassName}`}>
          <img
            src={value}
            alt="Preview"
            className={`w-full h-full ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-1" />
              )}
              Trocar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRemove}
              disabled={disabled || isUploading}
            >
              <X className="w-4 h-4 mr-1" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={disabled || isUploading}
          className={[
            "w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            previewClassName,
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
          ].join(" ")}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              <span className="text-sm text-muted-foreground">Enviando...</span>
            </>
          ) : isDragging ? (
            <>
              <Upload className="w-8 h-8 text-primary" />
              <span className="text-sm font-medium text-primary">
                Solte para enviar
              </span>
            </>
          ) : (
            <>
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {labelText}
              </span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, WEBP · máx. {fileSizeMB} MB
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
