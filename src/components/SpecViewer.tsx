import { AppSpec } from "@/types/appSpec";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Database, Navigation, Palette, Shield, Zap, Code, Layers } from "lucide-react";

interface SpecViewerProps {
  spec: AppSpec;
  rawJson: string;
}

export function SpecViewer({ spec, rawJson }: SpecViewerProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-green">
          <Smartphone className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground">{spec.appName}</h2>
          <p className="text-sm font-mono text-muted-foreground">{spec.packageName}</p>
          <p className="text-sm text-muted-foreground mt-1">{spec.description}</p>
        </div>
      </div>

      <Tabs defaultValue="screens" className="w-full">
        <TabsList className="w-full grid grid-cols-4 bg-secondary/50">
          <TabsTrigger value="screens" className="text-xs"><Layers className="h-3.5 w-3.5 mr-1" />Screens</TabsTrigger>
          <TabsTrigger value="data" className="text-xs"><Database className="h-3.5 w-3.5 mr-1" />Data</TabsTrigger>
          <TabsTrigger value="meta" className="text-xs"><Palette className="h-3.5 w-3.5 mr-1" />Meta</TabsTrigger>
          <TabsTrigger value="json" className="text-xs"><Code className="h-3.5 w-3.5 mr-1" />JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="screens" className="space-y-3 mt-4">
          {spec.screens?.map((screen) => (
            <Card key={screen.id} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {screen.name}
                  {screen.isLauncher && <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">Launcher</Badge>}
                  <Badge variant="outline" className="text-xs">{screen.layout}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{screen.description}</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {screen.components?.map((comp) => (
                    <span key={comp.id} className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground font-mono">
                      {comp.type}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {spec.navigation?.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Navigation className="h-4 w-4" /> Navigation Flow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {spec.navigation.map((nav, i) => (
                    <div key={i} className="text-xs font-mono text-muted-foreground">
                      <span className="text-foreground">{nav.from}</span>
                      <span className="mx-2 text-primary">→</span>
                      <span className="text-foreground">{nav.to}</span>
                      <span className="ml-2 text-muted-foreground">({nav.trigger})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="data" className="space-y-3 mt-4">
          {spec.dataModels?.map((model) => (
            <Card key={model.name} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-mono">{model.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {model.fields?.map((field) => (
                    <div key={field.name} className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-foreground">{field.name}</span>
                      <span className="text-primary">{field.type}</span>
                      {field.nullable && <span className="text-muted-foreground">?</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {spec.apis?.map((api) => (
            <Card key={api.name} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" /> {api.name}
                </CardTitle>
                <p className="text-xs font-mono text-muted-foreground">{api.baseUrl}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {api.endpoints?.map((ep, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs font-mono">
                      <Badge variant="outline" className="text-[10px]">{ep.method}</Badge>
                      <span className="text-foreground">{ep.path}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="meta" className="space-y-3 mt-4">
          {spec.theme && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Theme
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg border" style={{ backgroundColor: spec.theme.primaryColor }} />
                  <div className="w-8 h-8 rounded-lg border" style={{ backgroundColor: spec.theme.secondaryColor }} />
                  <span className="text-xs font-mono text-muted-foreground">{spec.theme.fontFamily}</span>
                  {spec.theme.darkMode && <Badge variant="secondary" className="text-xs">Dark Mode</Badge>}
                </div>
              </CardContent>
            </Card>
          )}

          {spec.features?.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {spec.features.map((f, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {spec.permissions?.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {spec.permissions.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-mono">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="json" className="mt-4">
          <div className="rounded-lg bg-surface-code border border-border p-4 overflow-auto max-h-[500px]">
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{rawJson}</pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
