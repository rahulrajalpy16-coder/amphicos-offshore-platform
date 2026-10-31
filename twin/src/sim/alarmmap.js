// Maps internal simulation alarm codes to the alarm catalogue in fpso_db.json (systems[].alarms).
// When the database lists an alarm for the same condition, its code, text and severity are used, so the
// HMI alarm lists show the engineering catalogue wording. Otherwise the simulation text is used.

// internal code prefix -> regex tested against the db alarm `code` and `text`
const RULES = [
  [/^PMS_BLACKOUT/, /blackout|dead bus/i],
  [/^PMS_NO_STBY/, /no standby|standby.*not available/i],
  [/^PMS_LOADSHED/, /load shed|preferential/i],
  [/^PMS_HC_BLOCK/, /heavy consumer|HC.*block/i],
  [/^PMS_OVERLOAD/, /overload/i],
  [/^PMS_FREQ/, /frequency/i],
  [/^PMS_VOLT/, /bus voltage|voltage (high|low|deviation)/i],
  [/^PMS_FTS/, /fail(ed)? to start|start fail/i],
  [/^PMS_SYNC_FAIL/, /sync/i],
  [/^RLY_TRIP/, /protection trip|relay trip|trip/i],
  [/^RLY_86/, /lockout|86/i],
  [/^RLY_TEST/, /test mode|test/i],
  [/^LO_P_LOW/, /lub.*oil.*press|LO press/i],
  [/^JW_T_HIGH/, /jacket|cooling water.*temp|HT.*temp/i],
  [/^EXH_DEV/, /exhaust.*dev/i],
  [/^EXH_HIGH/, /exhaust.*high/i],
  [/^START_AIR_LOW/, /start(ing)? air/i],
  [/^ESTOP/, /emergency stop/i],
  [/^SHUTDOWN/, /shutdown|overspeed/i],
  [/^OMD_HIGH/, /oil mist.*high|high.*oil mist|OMD.*alarm/i],
  [/^OMD_DEV/, /deviation/i],
  [/^OMD_PRE/, /pre.?alarm|slowdown/i],
  [/^OMD_FAULT/, /sensor fault|head fault|OMD.*fault/i],
  [/^VFD_TRIP/, /drive trip|VFD trip|trip/i],
  [/^VFD_HS/, /heatsink|overtemp/i],
  [/^VFD_TH/, /thermal/i],
  [/^BLR_TRIP/, /trip|flame failure/i],
  [/^BLR_LVL_LO/, /level.*low|low.*level/i],
  [/^BLR_LVL_HI/, /level.*high|high.*level/i],
  [/^BLR_P_HI/, /pressure.*high|high.*pressure/i],
  [/^BLR_FO_LO/, /fuel.*press/i],
  [/^BLR_SCANNER/, /scanner|flame/i],
  [/^IGG_O2_HIGH/, /O2|oxygen/i],
  [/^IGG_TRIP/, /trip/i],
  [/^IGG_SEAL_LO/, /seal/i],
  [/^IGG_DP_HI/, /deck.*press.*high|pressure high/i],
  [/^IGG_DP_LO/, /deck.*press.*low|pressure low/i],
  [/^IGG_SW_LO/, /scrubber|water flow/i],
  [/^ESD_ACTIVE/, /ESD/i],
  [/^FG_/, /gas|fire|F&G/i],
  [/^HLT_/, /controller|redundan|health|network/i],
  [/^PAGA_LOOP/, /loop|line|supervision/i],
  [/^PAGA_AMP/, /amplifier/i],
  [/^PABX_TRUNK/, /trunk|VSAT|external/i],
  [/^CCTV_VLOSS/, /video loss/i],
  [/^CCTV_TAMPER/, /tamper/i],
  [/^CCTV_NVR/, /NVR|record|storage|disk/i],
  [/^IPTV_ENC/, /encoder|stream/i],
  [/^IPTV_SAT/, /satellite|TVRO|receiver/i],
]

const cache = new Map()
export function resolveAlarm(db, systemId, code, text, severity) {
  const key = `${systemId}:${code.replace(/_(G\d+|[A-Z]_[A-Z0-9_]+|C_[A-Z0-9_]+)$/, '')}`
  let hit = cache.get(key)
  if (hit === undefined) {
    hit = null
    const list = (db.systems || []).find((s) => s.id === systemId)?.alarms || []
    const rule = RULES.find(([re]) => re.test(code))
    if (rule) hit = list.find((a) => rule[1].test(`${a.code || ''} ${a.text || ''}`)) || null
    cache.set(key, hit)
  }
  if (!hit) return { dbCode: null, text, severity }
  // keep the live, object specific text (e.g. which generator) and show the catalogue code
  const sev = ['low', 'high', 'critical'].includes(hit.severity) ? hit.severity : severity
  return { dbCode: hit.code, text, severity: sev, catalogue: hit }
}
export function clearAlarmCache() { cache.clear() }
