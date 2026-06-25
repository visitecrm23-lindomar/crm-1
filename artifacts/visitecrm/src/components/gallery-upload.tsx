import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Images } from "lucide-react";
import { useUploadImages } from "@/hooks/use-upload";

interface GalleryUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  maxImages?: number;
  fileSizeMB?: string;
}

export function GalleryUpload({
  value,
  onChange,
  onUploadingChange,
  disabled,
  maxImages = 3,
  fileSizeMB = "8",
}: GalleryUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const canAdd = value.length < maxImages;
  const maxSizeMB = parseFloat(fileSizeMB) || 8;

  const { startUpload, isUploading, cancelUpload } = useUploadImages(
    {
      onBegin: () => onUploadingChange?.(true),
      onComplete: (results) => {
        onUploadingChange?.(false);
        const newUrls = results.map((r) => r.url);
        onChange([...value, ...newUrls].slice(0, maxImages));
      },
      onError: (err) => {
        onUploadingChange?.(false);
        toast({ title: `Erro no upload: ${err.message}`, variant: "destructive" });
      },
    },
    { maxSizeMB }
  );

  const upload = (files: File[]) => {
    const toUpload = files.slice(0, maxImages - value.length);
    if (!toUpload.length) return;

    const oversized = toUpload.find((f) => f.size > maxSizeMB * 1024 * 1024);
    if (oversized) {
      toast({
        title: `Arquivo muito grande`,
        description: `"${oversized.name}" excede o limite de ${fileSizeMB} MB.`,
        variant: "destructive",
      });
      return;
    }

    startUpload(toUpload);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    upload(files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading && canAdd) setIsDragging(true);
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
    if (disabled || isUploading || !canAdd) return;
    const files = Array.from(e.dataTransfer.files);
    upload(files);
  };

  const handleRemove = (idx: number) =>
    onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading || !canAdd}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {value.length}/{maxImages} imagens
        </span>
        {canAdd && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" />
                  Adicionar Imagens
                </>
              )}
            </Button>
            {isUploading && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelUpload}
                className="text-muted-foreground hover:text-destructive px-2"
                title="Cancelar envio"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {value.length === 0 && !isUploading && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={disabled || isUploading}
          className={[
            "w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
          ].join(" ")}
        >
          {isDragging ? (
            <>
              <Upload className="w-7 h-7 text-primary" />
              <span className="text-sm font-medium text-primary">
                Solte para enviar
              </span>
            </>
          ) : (
            <>
              <Images className="w-7 h-7 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Clique ou arraste até {maxImages} imagens aqui
              </span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, WEBP · máx. {fileSizeMB} MB cada
              </span>
            </>
          )}
        </button>
      )}

      {(value.length > 0 || isUploading) && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((url, idx) => (
            <div
              key={idx}
              className="relative rounded-lg overflow-hidden aspect-video bg-muted group"
            >
              <img
                src={url}
                alt={`Galeria ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                disabled={disabled || isUploading}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:cursor-not-allowed"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="rounded-lg aspect-video bg-muted flex flex-col items-center justify-center gap-1 border-2 border-dashed border-muted-foreground/30">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              <button
                type="button"
                onClick={cancelUpload}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
