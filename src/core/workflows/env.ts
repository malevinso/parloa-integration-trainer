import { sandboxCredentials } from '../systems/fixtures';
import { httpBaseUrls, virtualBaseUrls } from '../systems/types';

/**
 * Default environment for workflows. Base URLs point at the in-browser
 * practice systems; the credentials are published sandbox values.
 */
export function defaultEnv(transport: 'virtual' | 'http' = 'virtual', httpOrigin = 'http://localhost:8787'): Record<string, string> {
  return {
    ...(transport === 'http' ? httpBaseUrls(httpOrigin) : virtualBaseUrls()),
    CRM_TOKEN: sandboxCredentials.crmBearerToken,
    VERIFY_TOKEN: sandboxCredentials.verificationBearerToken,
    OMS_API_KEY: sandboxCredentials.ordersApiKey,
    CARRIER_API_KEY: sandboxCredentials.carrierApiKey,
  };
}
