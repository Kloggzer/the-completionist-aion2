// Voice announcements (like WeakAuras' TTS) with the Windows voices via the WebView's speechSynthesis.
// Works while the overlay is hidden. Kinds can be muted individually (U.ttsOff[kind]).
import { host } from './host'
import { U, V } from './state'
import { lang } from './i18n'

/** Announcement kinds (each can be muted in the settings). */
export const TTS_KINDS: string[] = ['boss', 'timer', 'pet']

if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {
  if (V.voicesLogged) return
  V.voicesLogged = true
  host({ type: 'log', msg: 'TTS-Stimmen: ' + speechSynthesis.getVoices().map(v => `${v.name} [${v.lang}${v.localService ? '' : ', online'}]`).join(' | ') })
}

/** Voices for the current UI language. */
export const voices = () => (window.speechSynthesis ? speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang())) : [])

export function say(kind: string, text: string) {
  if (!U.tts || U.ttsOff?.[kind] || !window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance(text)
  const vs = voices()
  const v = vs.find(v => v.name === U.ttsVoice) || vs[0]
  u.lang = v?.lang || (lang() === 'de' ? 'de-DE' : 'en-US')
  if (v) u.voice = v
  u.volume = U.ttsVol ?? 0.8
  u.rate = U.ttsRate ?? 1.05
  speechSynthesis.speak(u)
}
