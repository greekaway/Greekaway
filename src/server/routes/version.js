'use strict';
const path = require('path');
const { readVersionFile, formatBuild } = require('../../server/lib/version');
const { computeLocalesVersion, computeDataVersion, computeAssetsVersion } = require('../../server/lib/assets');

function registerVersionRoutes(app, {
  IS_DEV,
  IS_RENDER,
  PROCESS_STARTED_AT,
  APP_VERSION,
  VERSION_FILE_PATH,
  LOCALES_DIR,
  ROOT_DIR
}) {
  app.get('/version.json', (req, res) => {
    try {
      const startedAt = PROCESS_STARTED_AT;
      const vf = readVersionFile(VERSION_FILE_PATH);
      const buildOverride = (process.env.BUILD_DATE_OVERRIDE || '').trim();
      const build = buildOverride ? buildOverride : (vf && vf.build ? String(vf.build) : formatBuild(startedAt));
      const ver = (vf && vf.version) ? String(vf.version) : APP_VERSION;
      const localesVersion = computeLocalesVersion(LOCALES_DIR);
      const dataVersion = computeDataVersion(path.join(ROOT_DIR, 'public', 'data'));
      const assetsVersion = computeAssetsVersion(path.join(ROOT_DIR, 'public'));
      const appVersion = Math.max(localesVersion || 0, dataVersion || 0, assetsVersion || 0);
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      return res.json({
        version: ver,
        build,
        buildNumber: vf && typeof vf.buildNumber !== 'undefined' ? vf.buildNumber : null,
        commit: vf && vf.commit ? String(vf.commit) : null,
        node: process.version,
        isDev: IS_DEV,
        isRender: IS_RENDER,
        startedAt,
        localesVersion,
        dataVersion,
        assetsVersion,
        appVersion
      });
    } catch (e) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      return res.json({ isDev: IS_DEV, isRender: IS_RENDER });
    }
  });

  app.get('/version', (req, res) => {
    try {
      const vf = readVersionFile(VERSION_FILE_PATH);
      const ver = (vf && vf.version) ? String(vf.version) : APP_VERSION;
      const buildOverride = (process.env.BUILD_DATE_OVERRIDE || '').trim();
      let build = vf && vf.build ? String(vf.build) : null;
      if (buildOverride) build = buildOverride;
      if (!build) build = formatBuild(PROCESS_STARTED_AT);
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      return res.json({ 
        version: ver, 
        build,
        buildNumber: vf && typeof vf.buildNumber !== 'undefined' ? vf.buildNumber : null,
        commit: vf && vf.commit ? String(vf.commit) : null
      });
    } catch (e) {
      return res.json({ version: APP_VERSION, build: formatBuild(PROCESS_STARTED_AT) });
    }
  });
}

module.exports = { registerVersionRoutes };
