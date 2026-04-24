import { useState, useCallback, useMemo } from "react";
import {
  useListLayouts,
  useCreateLayout,
  useUpdateLayout,
  useDeleteLayout,
} from "@workspace/api-client-react";
import type { VehicleLayout, LayoutCell } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  LayoutGrid,
  Armchair,
  Bus,
  MinusCircle,
  PlusCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type CellType = LayoutCell["type"];

interface CellTypeInfo {
  type: CellType;
  label: string;
  emoji: string;
  bg: string;
  border: string;
  text: string;
}

const CELL_TYPES: CellTypeInfo[] = [
  { type: "seat", label: "Assento", emoji: "💺", bg: "bg-blue-100", border: "border-blue-400", text: "text-blue-800" },
  { type: "vip", label: "VIP", emoji: "⭐", bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-800" },
  { type: "accessible", label: "Acessível", emoji: "♿", bg: "bg-green-100", border: "border-green-400", text: "text-green-800" },
  { type: "wc", label: "Banheiro", emoji: "🚽", bg: "bg-cyan-100", border: "border-cyan-400", text: "text-cyan-800" },
  { type: "stairs", label: "Escada", emoji: "🪜", bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-800" },
  { type: "fridge", label: "Frigobar", emoji: "🧊", bg: "bg-sky-100", border: "border-sky-400", text: "text-sky-800" },
  { type: "blocked", label: "Bloqueado", emoji: "🚫", bg: "bg-red-100", border: "border-red-400", text: "text-red-800" },
  { type: "empty", label: "Vazio", emoji: "·", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-400" },
];

const cellTypeMap = Object.fromEntries(CELL_TYPES.map(c => [c.type, c])) as Record<CellType, CellTypeInfo>;

interface LayoutTemplate {
  name: string;
  rows: number;
  cols: number;
  floors: number;
  numberingType: string;
  vehicleType: string;
  generate: (rows: number, cols: number) => LayoutCell[];
}

function makeGridCells(rows: number, cols: number, wcCols: number[] = []): LayoutCell[] {
  const cells: LayoutCell[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const isLastCol = c === cols;
      const isWcRow = r > rows - 1 && wcCols.includes(c);
      cells.push({
        row: r,
        col: c,
        floor: 1,
        type: isWcRow ? "wc" : isLastCol && r === 1 ? "stairs" : "seat",
      });
    }
  }
  return cells;
}

const TEMPLATES: LayoutTemplate[] = [
  {
    name: "Ônibus 46 (2x2)",
    rows: 12,
    cols: 4,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const isLastRow = r === rows;
          const type: CellType = isLastRow && (c === 3 || c === 4) ? "wc" : "seat";
          cells.push({ row: r, col: c, floor: 1, type });
        }
      }
      return cells;
    },
  },
  {
    name: "Micro-ônibus (2x1)",
    rows: 8,
    cols: 3,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Micro-ônibus",
    generate: (rows, cols) => makeGridCells(rows, cols, [3]),
  },
  {
    name: "Van 15 (1+2)",
    rows: 5,
    cols: 3,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Van",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          cells.push({ row: r, col: c, floor: 1, type: "seat" });
        }
      }
      return cells;
    },
  },
  {
    name: "Ônibus Leito (1x1)",
    rows: 10,
    cols: 4,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const isLastRow = r === rows;
          const type: CellType = isLastRow && (c === 3 || c === 4) ? "wc" : "vip";
          cells.push({ row: r, col: c, floor: 1, type });
        }
      }
      return cells;
    },
  },
  {
    name: "Double Decker (2 andares)",
    rows: 12,
    cols: 4,
    floors: 2,
    numberingType: "by_row",
    vehicleType: "Ônibus",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      for (let floor = 1; floor <= 2; floor++) {
        for (let r = 1; r <= rows; r++) {
          for (let c = 1; c <= cols; c++) {
            const isLastRow = r === rows;
            const isFirstRow = r === 1;
            let type: CellType = "seat";
            if (floor === 1 && isLastRow && (c === 3 || c === 4)) type = "wc";
            if (floor === 2 && isFirstRow && c === cols) type = "stairs";
            cells.push({ row: r, col: c, floor, type });
          }
        }
      }
      return cells;
    },
  },
  // ─── Novos templates ──────────────────────────────────────────────────────
  {
    name: "Convencional 50 (2x2)",
    rows: 13,
    cols: 4,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      let seatNum = 1;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const isLastRow = r === rows;
          const type: CellType = (isLastRow && (c === 1 || c === 2)) ? "wc" : "seat";
          const label = type === "seat" ? String(seatNum++) : undefined;
          cells.push({ row: r, col: c, floor: 1, type, ...(label ? { label } : {}) });
        }
      }
      return cells;
    },
  },
  {
    name: "Executivo 46 (2x2 VIP)",
    rows: 12,
    cols: 4,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      let seatNum = 1;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const isLastRow = r === rows;
          const isFirstRow = r === 1;
          const type: CellType = (isLastRow && (c === 1 || c === 2)) ? "wc"
            : isFirstRow ? "vip"
            : "seat";
          const label = (type === "seat" || type === "vip") ? String(seatNum++) : undefined;
          cells.push({ row: r, col: c, floor: 1, type, ...(label ? { label } : {}) });
        }
      }
      return cells;
    },
  },
  {
    name: "Semi-Leito 44 (2x2)",
    rows: 11,
    cols: 4,
    floors: 1,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (rows, cols) => {
      const cells: LayoutCell[] = [];
      let seatNum = 1;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          cells.push({ row: r, col: c, floor: 1, type: "seat", label: String(seatNum++) });
        }
      }
      return cells;
    },
  },
  {
    name: "DD Semi-Leito 56 (Sup 46 + Inf 10)",
    rows: 12,
    cols: 4,
    floors: 2,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (_rows, _cols) => {
      const cells: LayoutCell[] = [];
      let seatNum = 1;
      for (let r = 1; r <= 12; r++) {
        for (let c = 1; c <= 4; c++) {
          const isStairs = r === 4 && (c === 3 || c === 4);
          const type: CellType = isStairs ? "stairs" : "seat";
          const label = type === "seat" ? String(seatNum++) : undefined;
          cells.push({ row: r, col: c, floor: 2, type, ...(label ? { label } : {}) });
        }
      }
      for (let r = 1; r <= 4; r++) {
        for (let c = 1; c <= 4; c++) {
          const isWc = r === 4 && (c === 1 || c === 2);
          const type: CellType = isWc ? "wc" : "seat";
          const label = type === "seat" ? String(seatNum++) : undefined;
          cells.push({ row: r, col: c, floor: 1, type, ...(label ? { label } : {}) });
        }
      }
      return cells;
    },
  },
  {
    name: "DD Executivo 51 (Sup 46 + Inf 5)",
    rows: 12,
    cols: 4,
    floors: 2,
    numberingType: "sequential",
    vehicleType: "Ônibus",
    generate: (_rows, _cols) => {
      const cells: LayoutCell[] = [];
      let seatNum = 1;
      for (let r = 1; r <= 12; r++) {
        for (let c = 1; c <= 4; c++) {
          const isStairs = r === 4 && (c === 3 || c === 4);
          const isVip = r === 1;
          const type: CellType = isStairs ? "stairs" : isVip ? "vip" : "seat";
          const label = (type === "seat" || type === "vip") ? String(seatNum++) : undefined;
          cells.push({ row: r, col: c, floor: 2, type, ...(label ? { label } : {}) });
        }
      }
      for (let r = 1; r <= 3; r++) {
        for (let c = 1; c <= 3; c++) {
          const isWc = r === 3 && c === 3;
          const type: CellType = isWc ? "wc" : "seat";
          const label = type === "seat" ? String(seatNum++) : undefined;
          cells.push({ row: r, col: c, floor: 1, type, ...(label ? { label } : {}) });
        }
      }
      return cells;
    },
  },
];

function generateDefaultCells(rows: number, cols: number, existing: LayoutCell[] = [], floors = 1): LayoutCell[] {
  const existingMap = new Map(existing.map(c => [`${c.floor ?? 1}-${c.row}-${c.col}`, c]));
  const cells: LayoutCell[] = [];
  for (let f = 1; f <= floors; f++) {
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const key = `${f}-${r}-${c}`;
        cells.push(existingMap.get(key) ?? { row: r, col: c, floor: f, type: "seat" });
      }
    }
  }
  return cells;
}

function GridCell({
  cell,
  selected,
  onClick,
  cellSize,
}: {
  cell: LayoutCell;
  selected: boolean;
  onClick: () => void;
  cellSize: number;
}) {
  const info = cellTypeMap[cell.type] ?? cellTypeMap["seat"];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: cellSize, height: cellSize }}
      className={`
        rounded border-2 flex items-center justify-center text-center transition-all
        hover:scale-105 hover:shadow-sm
        ${selected ? "ring-2 ring-offset-1 ring-primary scale-105" : ""}
        ${info.bg} ${info.border} ${info.text}
      `}
      title={info.label}
    >
      <span style={{ fontSize: Math.max(10, cellSize * 0.4) }}>
        {info.emoji}
      </span>
    </button>
  );
}

function LayoutStats({ cells }: { cells: LayoutCell[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cell of cells) c[cell.type] = (c[cell.type] ?? 0) + 1;
    return c;
  }, [cells]);

  const seatTotal = (counts["seat"] ?? 0) + (counts["vip"] ?? 0) + (counts["accessible"] ?? 0);

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
        💺 {seatTotal} assento{seatTotal !== 1 ? "s" : ""}
      </Badge>
      {counts["vip"] ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">⭐ {counts["vip"]} VIP</Badge> : null}
      {counts["accessible"] ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">♿ {counts["accessible"]} acessível</Badge> : null}
      {counts["wc"] ? <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-300">🚽 {counts["wc"]} banheiro</Badge> : null}
      {counts["stairs"] ? <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">🪜 {counts["stairs"]} escada</Badge> : null}
      {counts["blocked"] ? <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">🚫 {counts["blocked"]} bloqueado</Badge> : null}
    </div>
  );
}

interface EditorState {
  name: string;
  description: string;
  vehicleType: string;
  rows: number;
  cols: number;
  floors: number;
  numberingType: string;
  cells: LayoutCell[];
}

function LayoutEditorModal({
  open,
  initialData,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  initialData: EditorState | null;
  onClose: () => void;
  onSave: (data: EditorState) => void;
  saving: boolean;
}) {
  const isEdit = !!initialData?.cells?.length;
  const [form, setForm] = useState<EditorState>(() =>
    initialData ?? {
      name: "",
      description: "",
      vehicleType: "Ônibus",
      rows: 12,
      cols: 4,
      floors: 1,
      numberingType: "sequential",
      cells: generateDefaultCells(12, 4, [], 1),
    }
  );
  const [selectedType, setSelectedType] = useState<CellType>("seat");
  const [editingFloor, setEditingFloor] = useState(1);

  const setField = <K extends keyof EditorState>(k: K) => (v: EditorState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const adjustDimension = (dim: "rows" | "cols" | "floors", delta: number) => {
    setForm(f => {
      const maxVal = dim === "floors" ? 3 : 20;
      const newVal = Math.max(1, Math.min(maxVal, f[dim] + delta));
      const updated = { ...f, [dim]: newVal };
      updated.cells = generateDefaultCells(
        dim === "rows" ? newVal : f.rows,
        dim === "cols" ? newVal : f.cols,
        f.cells,
        dim === "floors" ? newVal : f.floors,
      );
      if (dim === "floors" && editingFloor > newVal) setEditingFloor(newVal);
      return updated;
    });
  };

  const applyTemplate = (tpl: LayoutTemplate) => {
    setForm(f => ({
      ...f,
      rows: tpl.rows,
      cols: tpl.cols,
      floors: tpl.floors,
      numberingType: tpl.numberingType,
      vehicleType: tpl.vehicleType,
      cells: tpl.generate(tpl.rows, tpl.cols),
      name: f.name || tpl.name,
    }));
    setEditingFloor(1);
  };

  const handleCellClick = useCallback((row: number, col: number, floor: number) => {
    setForm(f => ({
      ...f,
      cells: f.cells.map(c =>
        c.row === row && c.col === col && (c.floor ?? 1) === floor ? { ...c, type: selectedType } : c,
      ),
    }));
  }, [selectedType]);

  const aisleAfterCol = Math.ceil(form.cols / 2);
  const cellSize = Math.min(42, Math.floor(320 / form.cols));
  const activeFloorCells = form.cells.filter(c => (c.floor ?? 1) === editingFloor);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            {isEdit ? "Editar Layout" : "Novo Layout de Assentos"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Left panel: controls */}
          <div className="space-y-5">
            {/* Name & description */}
            <div className="space-y-3">
              <div>
                <Label>Nome do layout *</Label>
                <Input
                  placeholder="Ex: Ônibus 46 lugares"
                  value={form.name}
                  onChange={e => setField("name")(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Tipo de veículo</Label>
                <Select value={form.vehicleType} onValueChange={setField("vehicleType")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Ônibus", "Micro-ônibus", "Van", "Carro", "Barco", "Avião", "Outro"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Numeração</Label>
                <Select value={form.numberingType} onValueChange={setField("numberingType")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequencial (1, 2, 3…)</SelectItem>
                    <SelectItem value="by_row">Por fileira (1A, 1B, 2A…)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  placeholder="Observações..."
                  value={form.description}
                  onChange={e => setField("description")(e.target.value)}
                  className="mt-1 h-16"
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dimensões</p>
              {(["rows", "cols", "floors"] as const).map(dim => (
                <div key={dim} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{dim === "rows" ? "Fileiras" : dim === "cols" ? "Colunas" : "Andares"}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => adjustDimension(dim, -1)}>
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    <span className="w-6 text-center font-semibold text-sm">{form[dim]}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => adjustDimension(dim, +1)}>
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Templates */}
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates rápidos</p>
              <div className="grid grid-cols-1 gap-1.5">
                {TEMPLATES.map(tpl => (
                  <Button
                    key={tpl.name}
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs h-8"
                    onClick={() => applyTemplate(tpl)}
                  >
                    <Bus className="h-3 w-3 mr-1.5 shrink-0" />
                    {tpl.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Resumo</p>
              <LayoutStats cells={form.cells} />
            </div>
          </div>

          {/* Right panel: grid editor */}
          <div className="space-y-4">
            {/* Palette */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tipo de célula selecionado</p>
              <div className="flex flex-wrap gap-1.5">
                {CELL_TYPES.map(ct => (
                  <button
                    key={ct.type}
                    type="button"
                    onClick={() => setSelectedType(ct.type)}
                    className={`
                      px-2 py-1 rounded border-2 text-xs font-medium flex items-center gap-1 transition-all
                      ${ct.bg} ${ct.border} ${ct.text}
                      ${selectedType === ct.type ? "ring-2 ring-offset-1 ring-primary scale-105 shadow-sm" : "opacity-70 hover:opacity-100"}
                    `}
                  >
                    {ct.emoji} {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Floor tabs (only when floors > 1) */}
            {form.floors > 1 && (
              <div className="flex gap-1">
                {Array.from({ length: form.floors }).map((_, i) => {
                  const f = i + 1;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setEditingFloor(f)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold border transition-all ${
                        editingFloor === f
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white text-muted-foreground border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {f}º Andar
                    </button>
                  );
                })}
              </div>
            )}

            {/* Grid */}
            <div className="border rounded-lg p-4 bg-slate-50 overflow-auto">
              <div className="bg-slate-700 text-white text-center py-1.5 rounded-t text-xs font-semibold mb-3">
                🚌 FRENTE DO VEÍCULO{form.floors > 1 ? ` — ${editingFloor}º ANDAR` : ""}
              </div>

              <div className="space-y-1 inline-block min-w-full">
                {Array.from({ length: form.rows }).map((_, rIdx) => {
                  const row = rIdx + 1;
                  const rowCells = activeFloorCells.filter(c => c.row === row).sort((a, b) => a.col - b.col);
                  const leftCells = rowCells.filter(c => c.col <= aisleAfterCol);
                  const rightCells = rowCells.filter(c => c.col > aisleAfterCol);

                  return (
                    <div key={row} className="flex items-center gap-2 justify-center">
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{row}</span>
                      <div className="flex gap-1">
                        {leftCells.map(cell => (
                          <GridCell
                            key={`${cell.floor ?? 1}-${cell.row}-${cell.col}`}
                            cell={cell}
                            selected={false}
                            onClick={() => handleCellClick(cell.row, cell.col, cell.floor ?? 1)}
                            cellSize={cellSize}
                          />
                        ))}
                      </div>
                      <div className="w-4 border-l-2 border-dashed border-slate-300 self-stretch" />
                      <div className="flex gap-1">
                        {rightCells.map(cell => (
                          <GridCell
                            key={`${cell.floor ?? 1}-${cell.row}-${cell.col}`}
                            cell={cell}
                            selected={false}
                            onClick={() => handleCellClick(cell.row, cell.col, cell.floor ?? 1)}
                            cellSize={cellSize}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-center text-muted-foreground mt-3">
                Clique em uma célula para aplicar o tipo selecionado
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
          >
            {saving ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Layout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LayoutCard({
  layout,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  layout: VehicleLayout;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const cells = layout.cells as LayoutCell[];
  const aisleAfterCol = Math.ceil(layout.cols / 2);
  const cellSize = Math.min(18, Math.floor(140 / layout.cols));
  const maxRows = Math.min(layout.rows, 12);

  return (
    <div className="border rounded-xl p-4 space-y-3 hover:shadow-md transition-shadow bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{layout.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {layout.vehicleType ?? "Veículo"} · {layout.rows} fileiras × {layout.cols} col. · {layout.seatCount} assentos
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicar" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Excluir" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mini preview */}
      <div className="bg-slate-50 rounded-lg p-2 overflow-hidden">
        <div className="bg-slate-600 text-white text-center py-0.5 rounded text-[10px] mb-1.5">FRENTE</div>
        <div className="space-y-0.5 inline-block w-full">
          {Array.from({ length: maxRows }).map((_, rIdx) => {
            const row = rIdx + 1;
            const rowCells = cells.filter(c => c.row === row).sort((a, b) => a.col - b.col);
            const leftCells = rowCells.filter(c => c.col <= aisleAfterCol);
            const rightCells = rowCells.filter(c => c.col > aisleAfterCol);
            return (
              <div key={row} className="flex items-center gap-1 justify-center">
                <div className="flex gap-0.5">
                  {leftCells.map(cell => {
                    const info = cellTypeMap[cell.type] ?? cellTypeMap["seat"];
                    return (
                      <div
                        key={`${cell.row}-${cell.col}`}
                        style={{ width: cellSize, height: cellSize }}
                        className={`rounded-sm border ${info.bg} ${info.border} flex items-center justify-center`}
                        title={info.label}
                      >
                        <span style={{ fontSize: cellSize * 0.5 }}>{info.emoji}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="w-1.5 border-l border-dashed border-slate-300 self-stretch" />
                <div className="flex gap-0.5">
                  {rightCells.map(cell => {
                    const info = cellTypeMap[cell.type] ?? cellTypeMap["seat"];
                    return (
                      <div
                        key={`${cell.row}-${cell.col}`}
                        style={{ width: cellSize, height: cellSize }}
                        className={`rounded-sm border ${info.bg} ${info.border} flex items-center justify-center`}
                        title={info.label}
                      >
                        <span style={{ fontSize: cellSize * 0.5 }}>{info.emoji}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {layout.rows > maxRows && (
            <p className="text-center text-[10px] text-muted-foreground mt-1">
              +{layout.rows - maxRows} fileiras...
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {layout.numberingType === "by_row"
          ? <Badge variant="outline" className="text-[10px] px-1.5">Numeração por fileira</Badge>
          : <Badge variant="outline" className="text-[10px] px-1.5">Numeração sequencial</Badge>}
        <Badge variant="outline" className="text-[10px] px-1.5">💺 {layout.seatCount} assentos</Badge>
      </div>
    </div>
  );
}

export default function LayoutsPage() {
  const { data: layouts = [], isLoading, refetch } = useListLayouts({ query: { queryKey: ["layouts"] } });
  const createLayout = useCreateLayout();
  const updateLayout = useUpdateLayout();
  const deleteLayout = useDeleteLayout();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<VehicleLayout | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleLayout | null>(null);
  const [saving, setSaving] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["layouts"] });

  const openCreate = () => {
    setEditingLayout(null);
    setEditorOpen(true);
  };

  const openEdit = (layout: VehicleLayout) => {
    setEditingLayout(layout);
    setEditorOpen(true);
  };

  const openDuplicate = (layout: VehicleLayout) => {
    setEditingLayout({
      ...layout,
      id: "",
      name: `${layout.name} (cópia)`,
    });
    setEditorOpen(true);
  };

  const handleSave = async (form: EditorState) => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingLayout?.id) {
        await updateLayout.mutateAsync({
          id: editingLayout.id,
          data: {
            name: form.name,
            description: form.description || null,
            vehicleType: form.vehicleType || null,
            rows: form.rows,
            cols: form.cols,
            floors: form.floors,
            numberingType: form.numberingType,
            cells: form.cells,
          },
        });
        toast({ title: "Layout atualizado com sucesso" });
      } else {
        await createLayout.mutateAsync({
          data: {
            name: form.name,
            description: form.description || null,
            vehicleType: form.vehicleType || null,
            rows: form.rows,
            cols: form.cols,
            floors: form.floors,
            numberingType: form.numberingType,
            cells: form.cells,
          },
        });
        toast({ title: "Layout criado com sucesso" });
      }
      invalidate();
      setEditorOpen(false);
    } catch {
      toast({ title: "Erro ao salvar layout", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLayout.mutateAsync({ id: deleteTarget.id });
      toast({ title: "Layout excluído" });
      invalidate();
    } catch {
      toast({ title: "Erro ao excluir layout", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const editorInitialData: EditorState | null = useMemo(() => {
    if (!editorOpen) return null;
    if (!editingLayout) return null;
    return {
      name: editingLayout.name ?? "",
      description: (editingLayout as VehicleLayout & { description?: string }).description ?? "",
      vehicleType: editingLayout.vehicleType ?? "Ônibus",
      rows: editingLayout.rows,
      cols: editingLayout.cols,
      floors: editingLayout.floors,
      numberingType: editingLayout.numberingType,
      cells: editingLayout.cells as LayoutCell[],
    };
  }, [editorOpen, editingLayout]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Layouts de Assentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie e gerencie mapas de assentos reutilizáveis para seus veículos
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Layout
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border rounded-xl p-4 h-48 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : layouts.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center space-y-3">
          <Armchair className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">Nenhum layout criado ainda</p>
          <p className="text-sm text-muted-foreground">
            Crie um layout para definir a disposição de assentos dos seus veículos
          </p>
          <Button onClick={openCreate} className="mt-2 gap-2">
            <Plus className="h-4 w-4" />
            Criar primeiro layout
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {layouts.map(layout => (
            <LayoutCard
              key={layout.id}
              layout={layout}
              onEdit={() => openEdit(layout)}
              onDuplicate={() => openDuplicate(layout)}
              onDelete={() => setDeleteTarget(layout)}
            />
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <LayoutEditorModal
          key={editingLayout?.id ?? "new"}
          open={editorOpen}
          initialData={editorInitialData}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir layout?</AlertDialogTitle>
            <AlertDialogDescription>
              O layout <strong>{deleteTarget?.name}</strong> será excluído permanentemente.
              Viagens que usam este layout manterão seus mapas de assentos existentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
