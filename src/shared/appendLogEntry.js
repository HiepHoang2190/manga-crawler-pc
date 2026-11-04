export function appendLogEntry(
  prev,
  msg,
  level = 'info',
  formatTime = () => new Date().toLocaleTimeString(),
  now = () => Date.now(),
) {
  return [...prev.slice(-200), { msg, level, t: now(), time: formatTime() }];
}
