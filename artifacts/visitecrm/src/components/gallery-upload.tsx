import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Images } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";

const MAX_GALLERY = 3;

interface GalleryUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}

export function GalleryUpload({ value, onChange, onUploadingChange, disabled }: GalleryUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAdd = value.length < MAX_GALLERY;

  const { startUpload, isUploading } = useUploadThing("tripGalleryImages", {
    onUploadBegin: () => onUploadingChange?.(true),
    onClientUploadComplete: (res) => {
      onUploadingChange?.(false);
      if (res?.length) {
        const newUrls = res.map((r) => r.ufsUrl ?? r.url);
        onChange([...value, ...newUrls].slice(0, MAX_GALLERY));
      }
    },
    onUploadError: (err) => {
      onUploadingChange?.(false);
      toast({ title: `Erro no upload: ${err.message}`, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_GALLERY - value.length);
    if (!files.length) return;
    startUpload(files);
    e.target.value = "";
  };

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

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
          {value.length}/{MAX_GALLERY} imagens
        </span>
        {canAdd && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Enviando...</>
            ) : (
              <><Upload className="w-4 h-4 mr-1" />Adicionar Imagens</>
            )}
          </Button>
        )}
      </div>

      {value.length === 0 && !isUploading && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="w-full h-32 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Images className="w-7 h-7 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Clique para adicionar até {MAX_GALLERY} imagens</span>
          <span className="text-xs text-muted-foreground">PNG, JPG, WEBP · máx. 4 MB cada</span>
        </button>
      )}

      {(value.length > 0 || isUploading) && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((url, idx) => (
            <div key={idx} className="relative rounded-lg overflow-hidden aspect-video bg-muted group">
              <img
                src={url}
                alt={`Galeria ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
            <div className="rounded-lg aspect-video bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
