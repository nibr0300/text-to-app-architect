import { Loader2 } from "lucide-react";

interface StreamingOutputProps {
  text: string;
}

export function StreamingOutput({ text }: StreamingOutputProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-primary font-medium">
        <Loader2 className="h-4 w-4 animate-spin" />
        Generating specification…
      </div>
      <div className="rounded-lg bg-surface-code border border-border p-4 overflow-auto max-h-[400px]">
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
          {text}
          <span className="animate-pulse-glow text-primary">▊</span>
        </pre>
      </div>
    </div>
  );
}
