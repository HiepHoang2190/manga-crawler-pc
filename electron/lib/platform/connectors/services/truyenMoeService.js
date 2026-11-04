/**
 * TruyenMoe (truyen.moe) — same engine as MoeTruyen, origin that allows foreign VPN IPs.
 */
const { createMoeTruyenFamilyService } = require('./moeTruyenService');

module.exports = createMoeTruyenFamilyService({
  domain: 'https://truyen.moe/',
  label: 'TruyenMoe',
  siteId: 'truyenmoe',
});
