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

  const maxSizeMB = parseFloat(fileSizeMB) || 8;

  const { startUpload, isUploading, isRetrying, uploadProgress, cancelUpload, guardDialog } = useUploadImage(
    {
      onBegin: () => onUploadingChange?.(true),
      onComplete: (result) => {
        onUploadingChange?.(false);
        onChange(result.url);
      },
      onError: (err) => {
        onUploadingChange?.(false);
        toast({ title: `Erro no upload: ${err.message}`, variant: "destructive" });
      },
      onCancel: () => onUploadingChange?.(false),
    },
    { maxSizeMB }
  );

  const upload = (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast({
        title: `Arquivo muito grande`,
        description: `Máximo permitido: ${fileSizeMB} MB. Arquivo enviado: ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        variant: "destructive",
      });
      return;
    }
    startUpload(file);
  };

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
          <div
            className={[
              "absolute inset-0 bg-black/50 transition-opacity flex flex-col items-center justify-center gap-2",
              isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            ].join(" ")}
          >
            {isUploading ? (
              <>
                <span className="text-white text-sm font-medium">
                  {isRetrying ? "Tentando novamente..." : uploadProgress > 0 ? `${uploadProgress}%` : "Enviando..."}
                </span>
                {!isRetrying && uploadProgress > 0 && (
                  <div className="w-20 bg-white/30 rounded-full h-1">
                    <div
                      className="bg-white h-1 rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={cancelUpload}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Trocar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={disabled}
                >
                  <X className="w-4 h-4 mr-1" />
                  Remover
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
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
                <span className="text-sm text-muted-foreground">
                  {isRetrying ? "Tentando novamente..." : uploadProgress > 0 ? `Enviando ${uploadProgress}%` : "Enviando..."}
                </span>
                {!isRetrying && uploadProgress > 0 && (
                  <div className="w-24 bg-muted-foreground/20 rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
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
          {isUploading && (
            <div className="flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelUpload}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4 mr-1" />
                Cancelar envio
              </Button>
            </div>
          )}
        </>
      )}
      {guardDialog}
    </div>
  );
}
