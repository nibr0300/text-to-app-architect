import { useCallback, useRef, useState } from "react";
import { GeneratedFile } from "@/types/generatedProject";
import { importProjectZip } from "@/lib/importZip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileArchive, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZipUploadProps {
  onImported: (files: GeneratedFile[]) => void;
}

export function ZipUpload({ onImported }: ZipUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        toast({ title: "Bara .zip-filer stöds", variant: "destructive" });
        return;
      }
      setBusy(true);
      try {
        const result = await importProjectZip(file);
        onImported(result.files);
        toast({
          title: "Kodbas inläst",
          description: `${result.files.length} filer redo att granskas${
            result.skipped ? ` — ${result.skipped} filer hoppades över` : ""
          }${result.truncated ? " (delar förkortade)" : ""}.`,
        });
      } catch (e) {
        toast({
          title: "Kunde inte läsa ZIP-filen",
          description: e instanceof Error ? e.message : "Okänt fel",
          variant: "destructive",
        });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onImported, toast],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "rounded-lg border border-dashed p-5 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <FileArchive className="h-6 w-6 mx-auto text-muted-foreground" />
      <p className="mt-2 text-sm text-foreground">Släpp en ZIP med källkod här</p>
      <p className="text-xs text-muted-foreground">
        Källkod och byggfiler läses (.kt, .java, .xml, .gradle.kts …). Binärer och build/ hoppas över.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 gap-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Välj ZIP-fil
      </Button>
    </div>
  );
}
