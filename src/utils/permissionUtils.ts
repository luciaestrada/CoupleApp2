interface PermissionInput {
  status: string; granted?: boolean; canAskAgain?: boolean; expires?: string | number;
  ios?: { accuracy?: string; status?: number }; android?: { accuracy?: string };
}
export function normalizePermission(permission: PermissionInput) {
  return {
    status: permission.status,
    granted: permission.granted === true || permission.status === 'granted',
    canAskAgain: permission.canAskAgain !== false,
    expires: permission.expires,
    accuracy: permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse'
      ? 'approximate'
      : permission.ios?.accuracy === 'full' || permission.android?.accuracy === 'fine'
        ? 'precise' : 'unknown',
  };
}

export function normalizeNotificationPermission(permission: PermissionInput) {
  const iosStatus = permission.ios?.status;
  const iosAuthorized = iosStatus === 2 || iosStatus === 3 || iosStatus === 4;
  return {
    ...normalizePermission(permission),
    granted: permission.granted === true || permission.status === 'granted' || iosAuthorized,
  };
}

export function permissionNeedsSettings(permission: { granted: boolean; canAskAgain: boolean } | null | undefined) {
  return Boolean(permission && !permission.granted && !permission.canAskAgain);
}
