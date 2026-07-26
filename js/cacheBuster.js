// ============================================================
//  PAPAP DOL — Super Hard Cache Buster & Version Manager
//  Ensures all players instantly fetch the latest code, assets,
//  and styles without browser caching delays.
// ============================================================

export const APP_BUILD_VERSION = '1.5.0_' + Date.now();

export async function forceHardCacheClear() {
  console.log('[CacheBuster] Executing hard cache purge...');

  // 1. Clear CacheStorage API
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      console.log('[CacheBuster] CacheStorage cleared.');
    } catch (e) {
      console.warn('[CacheBuster] CacheStorage clear warning:', e);
    }
  }

  // 2. Unregister Service Workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      console.log('[CacheBuster] Service Workers unregistered.');
    } catch (e) {
      console.warn('[CacheBuster] Service Worker unregister warning:', e);
    }
  }

  // 3. Clear stored version flags
  localStorage.setItem('papap_app_build', APP_BUILD_VERSION);
  localStorage.setItem('papap_last_cache_clear', Date.now().toString());

  // 4. Force hard reload bypassing browser cache
  window.location.reload(true);
}

/**
 * Checks if client build version is outdated and executes purge
 */
export function checkAndPurgeOutdatedCache() {
  const CURRENT_VER = '1.5.0';
  const savedVer = localStorage.getItem('papap_app_version');

  if (savedVer !== CURRENT_VER) {
    localStorage.setItem('papap_app_version', CURRENT_VER);
    forceHardCacheClear();
  }
}

// Auto-run version check on script load
checkAndPurgeOutdatedCache();
