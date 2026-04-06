export interface AppSpec {
  appName: string;
  packageName: string;
  description: string;
  screens: Screen[];
  navigation: Navigation[];
  dataModels: DataModel[];
  apis: Api[];
  features: string[];
  permissions: string[];
  theme: AppTheme;
}

export interface Screen {
  id: string;
  name: string;
  description: string;
  isLauncher: boolean;
  components: Component[];
  layout: string;
}

export interface Component {
  type: string;
  id: string;
  properties: Record<string, unknown>;
  events: ComponentEvent[];
}

export interface ComponentEvent {
  type: string;
  action: string;
}

export interface Navigation {
  from: string;
  to: string;
  trigger: string;
}

export interface DataModel {
  name: string;
  fields: DataField[];
}

export interface DataField {
  name: string;
  type: string;
  nullable: boolean;
}

export interface Api {
  name: string;
  baseUrl: string;
  endpoints: ApiEndpoint[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
}

export interface AppTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  darkMode: boolean;
}
