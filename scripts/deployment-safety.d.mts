type EnvironmentSource = Record<string, string | undefined>;

export const PRODUCTION_SUPABASE_PROJECT_REF: string;
export const PREVIEW_VERCEL_PROJECT_NAME: string;
export const PRODUCTION_VERCEL_PROJECT_NAME: string;

export function assertHostedAcceptanceTarget(source: EnvironmentSource): void;
export function assertLocalDatabaseTarget(source: EnvironmentSource): void;
export function assertProductionReleaseTarget(source: EnvironmentSource): void;
export function assertProductionLaunchConfiguration(
  source: EnvironmentSource,
): void;
