import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, ScanSearch, FileImage, ExternalLink, CheckSquare, Square } from "lucide-react";

interface OrphanedFile {
  key: string;
  name: string;
  size: number;
  url: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminMaintenance() {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [files, setFiles] = useState<OrphanedFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function scan() {
    setScanning(true);
    setScanned(false);
    setFiles([]);
    setSelected(new Set());
    try {
      const res = await fetch("/api/admin/maintenance/orphaned-files", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro na varredura");
      setFiles(data.files ?? []);
      setTotalSize(data.totalSize ?? 0);
      setScanned(true);
    } catch (err) {
      toast({ title: "Erro na varredura", description: String(err), variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }

  async function deleteSelected() {
    setDeleting(true);
    setConfirmOpen(false);
    const keys = selected.size > 0 ? Array.from(selected) : undefined;
    try {
      const res = await fetch("/api/admin/maintenance/orphaned-files", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, keys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao deletar");
      toast({
        title: `${data.deleted} arquivo(s) deletado(s)`,
        description: data.failed > 0 ? `${data.failed} falha(s)` : undefined,
      });
      setFiles(prev => prev.filter(f => !(keys ? keys.includes(f.key) : true)));
      setSelected(new Set());
      if (!keys) setScanned(false);
    } catch (err) {
      toast({ title: "Erro ao deletar arquivos", description: String(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  function toggleAll() {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map(f => f.key)));
    }
  }

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allSelected = files.length > 0 && selected.size === files.length;
  const someSelected = selected.size > 0;
  const deleteCount = selected.size > 0 ? selected.size : files.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manutenção</h1>
        <p className="text-sm text-muted-foreground">
          Limpeza de arquivos órfãos no armazenamento de mídia (UploadThing).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileImage className="w-4 h-4 text-primary" />
            Limpeza de Arquivos Órfãos
          </CardTitle>
          <CardDescription className="text-xs">
            Arquivos enviados para o armazenamento que não estão mais vinculados a nenhum registro no banco de dados.
            Faça a varredura para identificá-los e remova-os para liberar espaço.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={scan} disabled={scanning || deleting} size="sm">
              {scanning ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ScanSearch className="w-4 h-4 mr-2" />
              )}
              {scanning ? "Varrendo..." : "Verificar Arquivos Órfãos"}
            </Button>
            {scanned && (
              <div className="flex items-center gap-2">
                {files.length > 0 ? (
                  <Badge variant="destructive" className="text-xs">
                    {files.length} arquivo{files.length !== 1 ? "s" : ""} órfão{files.length !== 1 ? "s" : ""} — {formatBytes(totalSize)}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                    Nenhum arquivo órfão encontrado
                  </Badge>
                )}
              </div>
            )}
          </div>

          {scanned && files.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={toggleAll}
                >
                  {allSelected ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirmOpen(true)}
                  className="text-xs"
                >
                  {deleting ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {someSelected
                    ? `Deletar ${selected.size} selecionado${selected.size !== 1 ? "s" : ""}`
                    : `Deletar todos (${files.length})`}
                </Button>
              </div>

              <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto text-sm">
                {files.map(file => (
                  <div key={file.key} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                    <Checkbox
                      checked={selected.has(file.key)}
                      onCheckedChange={() => toggle(file.key)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{file.key}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatBytes(file.size)}</span>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80"
                      title="Visualizar arquivo"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a deletar permanentemente{" "}
              <strong>{deleteCount} arquivo{deleteCount !== 1 ? "s" : ""}</strong> do armazenamento.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSelected}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar {deleteCount} arquivo{deleteCount !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
