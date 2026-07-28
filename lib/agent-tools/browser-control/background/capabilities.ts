import { isRestrictedUrl } from '../driver/extension/restricted-urls';

export class CapabilityError extends Error {
  constructor(
    readonly code: 'RESTRICTED_URL' | 'HOST_PERMISSION_REQUIRED' | 'UNSUPPORTED_OPERATION',
    message: string,
  ) {
    super(message);
  }
}

export interface TargetCapabilities {
  canAccessTab(tab: { url: string }): Promise<boolean>;
  advancedSettingEnabled(): boolean;
}

export async function assertTargetCapabilities(
  tab: { url: string },
  capabilities: TargetCapabilities,
): Promise<void> {
  if (isRestrictedUrl(tab.url)) {
    throw new CapabilityError('RESTRICTED_URL', 'Browser-internal and Web Store URLs cannot be controlled.');
  }
  if (!(await capabilities.canAccessTab(tab))) {
    throw new CapabilityError('HOST_PERMISSION_REQUIRED', 'The extension has not been granted access to this site.');
  }
}

export function assertAdvancedCapability(
  connectionAdvancedEnabled: boolean,
  capabilities: TargetCapabilities,
): void {
  if (!connectionAdvancedEnabled || !capabilities.advancedSettingEnabled()) {
    throw new CapabilityError('UNSUPPORTED_OPERATION', 'Advanced browser evaluation is disabled.');
  }
}
