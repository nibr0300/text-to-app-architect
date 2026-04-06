import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Smartphone, Loader2, Sparkles } from "lucide-react";

interface DescriptionInputProps {
  onGenerate: (description: string) => void;
  isLoading: boolean;
}

const EXAMPLES = [
  "A fitness tracker app with workout logging, progress charts, and a social feed where users share achievements",
  "A recipe organizer with ingredient scanning, meal planning, and grocery list generation",
  "A habit tracker with streaks, reminders, daily quotes, and a minimalist dark UI",
];

export function DescriptionInput({ onGenerate, isLoading }: DescriptionInputProps) {
  const [description, setDescription] = useState("");

  return (
    <div className="space-y-4">
      <div className="relative">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your Android app in detail... e.g. 'A task management app with categories, due dates, priority levels, and a dashboard showing completion stats'"
          className="min-h-[160px] bg-card border-border text-foreground placeholder:text-muted-foreground resize-none font-mono text-sm leading-relaxed focus:ring-primary"
          disabled={isLoading}
        />
        <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
          {description.length} chars
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => setDescription(ex)}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            disabled={isLoading}
          >
            {ex.slice(0, 40)}…
          </button>
        ))}
      </div>

      <Button
        onClick={() => onGenerate(description)}
        disabled={!description.trim() || isLoading}
        className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 glow-green"
        size="lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Generating Spec…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" />
            Generate App Spec
          </>
        )}
      </Button>
    </div>
  );
}
