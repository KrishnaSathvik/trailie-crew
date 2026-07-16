type ProtectionBypass = {
  scope?: string;
};

type ProtectionBypasses = Record<string, ProtectionBypass | null | undefined>;

export function selectGeneratedAutomationBypass(
  existing: ProtectionBypasses | null | undefined,
  generated: ProtectionBypasses | null | undefined,
): [string, ProtectionBypass];
